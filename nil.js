var async = require("async");
var _ = require("lodash");
var fs = require('fs');
var pg = require('pg')
var program = require('commander');

var CONNECTION_STRING = "postgres://postgres:postgres@localhost/pyramide"
var MIGRATION_FOLDER = "migration"
var UP_MIGRATION_SUFFIX = /-up\.sql$/
var DOWN_MIGRATION_SUFFIX = /-down\.sql$/
var MIGRATION_PREFIX = /^\d{13}-/
var VERSION = /^\d{13}/

// filters
var filterFilesByRegExp = function(regExp, files){
  return function(cb, ctx){
    var filteredFiles = _.filter(ctx[files], function(fileName){
      return regExp.test(fileName);
    });
    cb(null, filteredFiles)
  };
};
var getFiles = function(cb, ctx){
  fs.readdir( "./" + MIGRATION_FOLDER, cb);
};

//TODO externalize this into a plugin

var connection = function(connectionString){
  return function(cb, ctx){
    pg.connect(connectionString, function(err, connection, done){
      if(connection){
        connection.done = done;
      }
      cb(err, connection);
    });
  };
};
var closeConnectionAndReportError = function(err, ctx){
  if(ctx.connection && ctx.connection.done){
    ctx.connection.done();
  }
  if(err){
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
};
var sortBy = function(files, direction){
  return function(cb, ctx){
    var sorted = ctx[files].sort()
    cb(null,((direction == "asc") ? sorted: sorted.reverse()));
  };
};
var oldMigrations = function(order){
  return function(cb, ctx){
    order = order || "asc";

    var ascStmt = "select version from schema_migrations order by version ASC";
    var descStmt = "select version from schema_migrations order by version DESC";
    var stmt = order == "asc" ? ascStmt : descStmt;
    ctx.connection.query(stmt, cb);
  };
}
var oldMigrationsVersions = function(cb, ctx){
  cb(null, _.pluck(ctx.oldMigrations.rows, 'version'));
};
var undoneMigrations = function(candidateFiles){
  return function(cb, ctx){
    cb(null, _.filter(ctx[candidateFiles], function(filename){
      var currentversion  = VERSION.exec(filename)[0];
      return !_.contains(ctx.oldMigrationsVersions, currentversion);
    }));
  };
};
var doneMigrations = function(candidateFiles){
  return function(cb, ctx){
    cb(null, _.filter(ctx[candidateFiles], function(filename){
      var currentversion  = VERSION.exec(filename)[0];
      return _.contains(ctx.oldMigrationsVersions, currentversion);
    }));
  };
};

var readFiles = function(files){
  return function(cb, ctx){
    var createWorkUnit = function(fileName, fileContent, cb){
       var workUnit = {
        file: fileName,
        version: VERSION.exec(fileName)[0],
        lines: _.each(fileContent.split(';'), function(line){ return line.trim();})
      }
      cb(null, workUnit);
    };
    var processFile = function(filename, cb){
      async.waterfall([
        function(cb){ fs.readFile( "./"+MIGRATION_FOLDER+"/"+filename, 'utf-8', cb); },
        function(fileContent){ createWorkUnit(filename, fileContent, cb) }
      ], cb);
    };
    async.map(ctx[files], processFile, cb);
  };
};
var executeFiles = function(cb, ctx){
  var executeLines = function(workUnit, cb){
    async.eachSeries(workUnit.lines, function(line,cb){
      ctx.connection.query(line, cb);
    }, cb);
  };
  var recordMigrationExecution = function(workUnit, cb){
    var upStmt = "insert into schema_migrations (version) values ( $1 );";
    var downStmt = "delete from schema_migrations where version =  $1;";
    var stmt = UP_MIGRATION_SUFFIX.test(workUnit.file) ? upStmt : downStmt;
    ctx.connection.query(stmt, [workUnit.version], cb);
  };
  var executeWorkUnit = function(workUnit, cb){
    async.series([
        function(cb){executeLines(workUnit, cb);},
        function(cb){recordMigrationExecution(workUnit, cb);}
    ], cb);
  };
  async.eachSeries(ctx.workUnits, executeWorkUnit, cb);
};

var testTable = function(cb, ctx){
  var testStmt = "select count(*) from pg_catalog.pg_tables where tablename = 'schema_migrations';"
  ctx.connection.query( testStmt, cb);
}
var createTable = function(cb, ctx){
  var createStmt = "\
  create table schema_migrations (\
    id serial primary key not null,\
    version character varying(255) unique not null\
  ); "

  if(ctx.testTable.rows[0].count != 1){
    ctx.connection.query( createStmt, cb);
  }else{
    cb(null, "");
  }
}
var takeUntil = function(files, stopAt){
  return function(cb, ctx){
    if(!stopAt){
      cb(null, ctx[files])
    }else{
      var index = _.findIndex(ctx[files],function(filename){
        return VERSION.exec(filename)[0] == VERSION.exec(stopAt)[0];
      });
      if(index == -1){
        cb(null, ctx[files])
      }else{
        var limitedFiles = _.take(ctx[files], index+1);
        cb(null, limitedFiles);
      }
    }
  }
}


var doUp = function(conString, upTo){
  upTo = upTo || "";
  async.auto({
    "files":                    getFiles,
    "connection":               connection(conString),
    "migrationFiles":          ["files", filterFilesByRegExp(MIGRATION_PREFIX, "files")],
    "upMigrationFiles":        ["migrationFiles", filterFilesByRegExp(UP_MIGRATION_SUFFIX, "migrationFiles")],
    "sortedUpMigrationFiles":  ["upMigrationFiles", sortBy('upMigrationFiles', 'asc')],
    "oldMigrations":           ["connection",oldMigrations("asc")],
    "oldMigrationsVersions":   ["oldMigrations", oldMigrationsVersions],
    "undoneMigrations":        ["oldMigrationsVersions","sortedUpMigrationFiles", undoneMigrations("sortedUpMigrationFiles")],
    "limitedUndoneMigrations": ["undoneMigrations", takeUntil("undoneMigrations", upTo)],
    "workUnits":               ["limitedUndoneMigrations", readFiles("limitedUndoneMigrations")],
    "executeFiles":            ["workUnits", executeFiles]
  },closeConnectionAndReportError );
};

var doDown = function(conString, downTo){
  downTo = downTo || "";
  async.auto({
    "files":                    getFiles,
    "connection":               connection(conString),
    "migrationFiles":           ["files", filterFilesByRegExp(MIGRATION_PREFIX, "files")],
    "downMigrationFiles":       ["migrationFiles", filterFilesByRegExp(DOWN_MIGRATION_SUFFIX, "migrationFiles")],
    "sortedDownMigrationFiles": ["downMigrationFiles", sortBy('downMigrationFiles', 'desc')],
    "oldMigrations":            ["connection",oldMigrations("desc")],
    "oldMigrationsVersions":    ["oldMigrations", oldMigrationsVersions],
    "doneMigrations":           ["oldMigrationsVersions","sortedDownMigrationFiles", doneMigrations("sortedDownMigrationFiles")],
    "limitedDownMigration":     ["downMigration", takeUntil("doneMigrations", downTo)],
    "workUnits":                ["limitedDownMigration", readFiles("limitedDownMigration")],
    "executeFiles":             ["workUnits", executeFiles]
  },closeConnectionAndReportError );
};

var doInit = function(conString){
  async.auto({
    "connection":               connection(conString),
    "testTable": ["connection", testTable],
    "createTable": ["testTable", createTable]
  }, closeConnectionAndReportError );
}
var doCreate = function(name){
  var now = new Date().getTime();
  var files = [
    {
      name: now + name + "-up.sql",
      template: "-- create table egypthian_cat_etching ( id serial primary key not null, name text unique not null ); "
    },{
      name: now + name + "-down.sql",
      template: "-- drop table if exists egypthian_cat_etching;"
    }
  ];
  async.each(files, function(file, cb){
    console.log( "file", file.name)
    fs.writeFile("./" + MIGRATION_FOLDER +"/"+ file.name, file.template, cb);
  }, function(err){
    if(err){console.error(err);}
  });
}

program
  .version("0.0.1")
  .usage("<command> [options]")
  .option("-c, --connection-string <connectionString>","Define a connection string")

program.command("init")
      .description("Create the schema migration table on table. It's safe to run it multiple time, old version won't be altered.")
      .action(function(){
        doInit(program.connectionString)
      });
program.command("create <name>")
       .description("Create new up and down migration script")
       .action(function(name){
         doCreate(name)
       });
program.command("up [name]")
       .description("Run all migration up to name provided. If no name is provided, it will run up to the last one.")
       .action(function(name){
         doUp(program.connectionString, name);
       });
program.command("down [name]")
       .description("Run all migration down to name provided. If no name is provided, it will run down to the first one.")
       .action(function(name){
         doDown(program.connectionString, name);
       });

program.parse(process.argv);
