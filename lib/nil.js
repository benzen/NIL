/*
 * grunt-nil
 *
 * Copyright (c) 2014 Benjamin Dreux
 * Licensed under the MIT license.
 * https://github.com/benzen/NIL/blob/master/LICENSE-MIT
 */

var async = require("async");
var _ = require("lodash");
var fs = require('fs');
var pg = require('pg');
var path = require('path');

var DEFAULT_MIGRATION_FOLDER = "migration"
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
var getFiles = function(migrationFolder){
  return function(cb, ctx){
    var p = path.resolve(migrationFolder);
    fs.readdir(p , cb);
  };
}
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
var closeConnectionAndCallback = function(done){
  return function(err, ctx){
    if(ctx.connection && ctx.connection.done){
      ctx.connection.done();
    }
    done(err);
  };
}
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
    var predicate = function(filename){
      var currentversion  = VERSION.exec(filename)[0];
      return _.contains(ctx.oldMigrationsVersions, currentversion);
    }
    var migrations = _.filter(ctx[candidateFiles], predicate);
    cb(null, migrations);
  };
};

var readFiles = function(migrationFolder, files){
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
      var filePath = path.resolve(process.cwd(), migrationFolder, filename);
      async.waterfall([
        function(cb){ fs.readFile( filePath, 'utf-8', cb); },
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
var createMigrationFolder = function(migration_folder){
  return function(cb, ctx){
    var folderPath = path.resolve(process.cwd(), migration_folder);
    fs.mkdir(folderPath, cb);
  };
};

var doUp = function(connectionString, migrationFolder, upDownScript, done){
  migrationFolder = migrationFolder || DEFAULT_MIGRATION_FOLDER;
  upDownScript = upDownScript || "";
  async.auto({
    "files":                    getFiles(migrationFolder),
    "connection":               connection(connectionString),
    "migrationFiles":          ["files", filterFilesByRegExp(MIGRATION_PREFIX, "files")],
    "upMigrationFiles":        ["migrationFiles", filterFilesByRegExp(UP_MIGRATION_SUFFIX, "migrationFiles")],
    "sortedUpMigrationFiles":  ["upMigrationFiles", sortBy('upMigrationFiles', 'asc')],
    "oldMigrations":           ["connection",oldMigrations("asc")],
    "oldMigrationsVersions":   ["oldMigrations", oldMigrationsVersions],
    "undoneMigrations":        ["oldMigrationsVersions","sortedUpMigrationFiles", undoneMigrations("sortedUpMigrationFiles")],
    "limitedUndoneMigrations": ["undoneMigrations", takeUntil("undoneMigrations", upDownScript)],
    "workUnits":               ["limitedUndoneMigrations", readFiles(migrationFolder, "limitedUndoneMigrations")],
    "executeFiles":            ["workUnits", executeFiles]
  },closeConnectionAndCallback(done) );
};

var doDown = function(connectionString, migrationFolder, upDownScript, done){
  migrationFolder = migrationFolder || DEFAULT_MIGRATION_FOLDER;
  upDownScript = upDownScript || "";
  async.auto({
    "files":                    getFiles(migrationFolder),
    "connection":               connection(connectionString),
    "migrationFiles":           ["files", filterFilesByRegExp(MIGRATION_PREFIX, "files")],
    "downMigrationFiles":       ["migrationFiles", filterFilesByRegExp(DOWN_MIGRATION_SUFFIX, "migrationFiles")],
    "sortedDownMigrationFiles": ["downMigrationFiles", sortBy('downMigrationFiles', 'desc')],
    "oldMigrations":            ["connection",oldMigrations("desc")],
    "oldMigrationsVersions":    ["oldMigrations", oldMigrationsVersions],
    "doneMigrations":           ["oldMigrationsVersions","sortedDownMigrationFiles", doneMigrations("sortedDownMigrationFiles")],
    "limitedDownMigration":     ["doneMigrations", takeUntil("doneMigrations", upDownScript)],
    "workUnits":                ["limitedDownMigration", readFiles(migrationFolder, "limitedDownMigration")],
    "executeFiles":             ["workUnits", executeFiles]
  },closeConnectionAndCallback(done) );
};

var doInit = function(connectionString, migrationFolder, upDownScript, done){
  migrationFolder = migrationFolder || DEFAULT_MIGRATION_FOLDER;
  async.auto({
    "connection": connection(connectionString),
    "createMigration":createMigrationFolder(migrationFolder),
    "testTable": ["connection", testTable],
    "createTable": ["testTable", createTable]

  }, closeConnectionAndCallback(done) );
}
var doCreate = function(connectionString, migrationFolder, upDownScript, done){
  migrationFolder = migrationFolder || DEFAULT_MIGRATION_FOLDER;
  var now = new Date().getTime();

  var files = [
    {
      name: now + "-" + upDownScript + "-up.sql",
      template: "-- create table egypthian_cat_etching ( id serial primary key not null, name text unique not null ); "
    },{
      name: now + "-" + upDownScript + "-down.sql",
      template: "-- drop table if exists egypthian_cat_etching;"
    }
  ];
  async.each(files, function(file, cb){
    var filePath = path.resolve(process.cwd(), migrationFolder, file.name);
    fs.writeFile( filePath, file.template, cb);
  }, done);
}

module.exports = {
  "create": doCreate,
  "init": doInit,
  "up": doUp,
  "down": doDown
};
