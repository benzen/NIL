/*
 * grunt-nil
 *
 * Copyright (c) 2014 Benjamin Dreux
 * Licensed under the MIT license.
 * https://github.com/benzen/NIL/blob/master/LICENSE-MIT
 */
nil = require("../lib/nil");
_ = require("lodash");
module.exports = function(grunt) {
  grunt.registerTask('nil', "migrate data base",function(operation, upDownScript) {
    var done = this.async();
    if(!this.options().connectionString){
      grunt.log.error("Connection String is required");
      done(false);
      return;
    };
    var args = [this.options().connectionString, this.options().migrationFolder, this.options().migrationTable, upDownScript, function(err, de){ done(err) } ];
    if(!_.contains(["create", "init", "up", "down"], operation)){
      var msg = "Unsupported operation"
      grunt.log.error(msg);
      done(false);
      return
    }
    nil[operation].apply(this, args);
  });
};
