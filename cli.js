#!/usr/bin/env node
var nil = require("./lib/nil");
var program = require('commander');

program
  .version("0.0.1")
  .usage("<command> [options]")
  .option("-c, --connection-string <connectionString>","Define a connection string")

program.command("init")
      .description("Create the schema migration table on table. It's safe to run it multiple time, old version won't be altered.")
      .action(function(){
        nil.init(program.connectionString)
      });
program.command("create <name>")
       .description("Create new up and down migration script")
       .action(function(name){
         nil.create(name)
       });
program.command("up [name]")
       .description("Run all migration up to name provided. If no name is provided, it will run up to the last one.")
       .action(function(name){
         nil.up(program.connectionString, name);
       });
program.command("down [name]")
       .description("Run all migration down to name provided. If no name is provided, it will run down to the first one.")
       .action(function(name){
         nil.down(program.connectionString, name);
       });

program.parse(process.argv);
