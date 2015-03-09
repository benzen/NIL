NIL: Node mIgration tooL
==========================


A simple tool to run sql migration using plain text file


Usage
-----

There is two fashion:

- as CLI tool; which require `$ npm install -g nil`
- as straight module;  which require `$ npm install nil`

````bash
$ nil init -c <my-connection-string> # create schema migration table and migration folder
$ nil create 2014-01-01-add-seven-life-cat-etching -c <my-connection-string># create two new migration script (`UP` and `DOWN`)
$ nil up -c <my-connection-string># run all `UP` migration from current to last existing one
$ nil up 2014-01-01-add-seven-life-cat-etching -c <my-connection-string># run all migration `UP` to the specified one
$ nil down -c <my-connection-string># run all migration `DOWN` migration to first one
$ nil down 2014-01-01-add-seven-life-cat-etching -c <my-connection-string># run all migration `DOWN` migration to the specifed one
````

or

````Javascript
var nil = require("nil");
nil.init("my connection string");

nil.create("my-fancy-migration");

nil.up("my connection string");
nil.up("my connection string", "1111111111111-specific-migration");

nil.down("my connection string");
nil.down("my connection string", "1111111111111-specific-migration");

````


How it works
------------

Migration as simple SQL scripts.
They are all stored in the  `migration` folder.
When you create a new migration script it will create two files in the migration folder.
One for going up and one for going down.
They will have the same name but with a suffix to distinguish them, like this

    $ tree migration
    migration/
    ├── 1416635703604-add-seven-life-cat-etching-down.sql
    └── 1416635703604-add-seven-life-cat-etching-up.sql

When running a script, NIL will record the name of the script that are already applied to the database.
This way the migration scripts can only be applied once.
When running a down script, the name of the script is removed from the database.

Grunt module
-------------

There is also a grunt plugin for NIL. It's included in this repository.
At the moment, Nil is not provided as a separate npm module, all is included in this module.
So the loading of the nil grunt task, is a little bit weird, it use a local module.

````Javascript
grunt.initConfig({
  "nil":{
    "options":{
      "connectionString":"postgres://postgres:postgres@localhost/pyramide",
      "migrationFolder":"migration"
    }
  }
});

grunt.loadTasks("./node_modules/nil/tasks");
````

Then in your shell you will use it like this

````shell
grunt nil:init                   # basic env setup
grunt nil:create:<nameOfMyTable> # create new migration script
grunt nil:up                     # run all up scripts
grunt nil:down                   # run all down script

````

Be aware of
----------------

When reading the file, NIL expect to find normally formatted sql script. Meaning with semi-colon to the end of each command.
The command can be spanned on multiple line, it won't affect the execution of the migration.

Missing parts
-----------------

At the moment it's a simple js file.
* when using CLI interface, i'd like to be able to _save_ connection string, in a file or environnement in order to reuse it without typing it
* I want to make plugins out of this. the main will have the logic from executing files, the plugin will have the logic to create connection with given db.

Thanks
-----------

Thanks to [@fxg42](https://github.com/fxg42) for the base idea and organization
