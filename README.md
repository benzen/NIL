NIL: Node mIgration tooL
==========================


A simple tool to run sql migration using plain text file


Usage
-----

    $ nil create 2014-01-01-add-seven-life-cat-etching -c <my-connection-string># create two new migration script (`UP` and `DOWN`)
    $ nil up -c <my-connection-string># run all `UP` migration from current to last existing one
    $ nil up 2014-01-01-add-seven-life-cat-etching -c <my-connection-string># run all migration `UP` to the specified one
    $ nil down -c <my-connection-string># run all migration `DOWN` migration to first one
    $ nil down 2014-01-01-add-seven-life-cat-etching -c <my-connection-string># run all migration `DOWN` migration to the specifed one


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

Missing parts
-----------------

At the moment it's a simple js file.
* when using CLI interface, i'd like to be able to _save_ connection string, in a file or environnement in order to reuse it without typing it
* I'd like to be able to call this from grunt
* I want to make migration folder configurable
* I want to make plugins out of this. the main will have the logic from executing files, the plugin will have the logic to create connection with given db.
* I want all file path used to converted to use path module

Thanks
-----------

Thanks to [@fxg42](https://github.com/fxg42) for the base idea and organization
