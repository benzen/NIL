#!/usr/bin/env node
/*
 * grunt-nil
 *
 * Copyright (c) 2014 Benjamin Dreux
 * Licensed under the MIT license.
 * https://github.com/benzen/NIL/blob/master/LICENSE-MIT
 */

var nil = require("./lib/nil");
var program = require('commander');

var done = function(err){
  if(err){
    console.error(err);
    process.exit(1);
  }
  process.exit(0);
};
program
  .version("0.0.1")
  .usage("<command> [options]")
  .option("-c, --connection-string <connectionString>","Define a connection string")
  .option("-f, --migration-folder <migrationFolder>","Define folder where migration scripts are. Default to 'migration'", "migration")
  .option("-t, --migration-table <migrationTable>","Define table use to keep tracks of migrations script executed. Default to 'schema_migration'", "schema_migration")

program.command("init")
      .description("Create the schema migration table on table. It's safe to run it multiple time, old version won't be altered.")
      .action(function(){
        nil.init(program.connectionString, program.migrationFolder, null, done)
      });
program.command("create <name>")
       .description("Create new up and down migration script")
       .action(function(name){
         nil.create(program.connectionString, program.migrationFolder, name, done)
       });
program.command("up [name]")
       .description("Run all migration up to name provided. If no name is provided, it will run up to the last one.")
       .action(function(name){
         nil.up(program.connectionString, program.migrationFolder, name, done);
       });
program.command("down [name]")
       .description("Run all migration down to name provided. If no name is provided, it will run down to the first one.")
       .action(function(name){
         nil.down(program.connectionString, program.migrationFolder, name, done);
       });

program.parse(process.argv);
