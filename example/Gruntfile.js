module.exports = function(grunt) {
  "use strict";

  // Project configuration.
  grunt.initConfig({
    "nil":{
      "options":{
        "connectionString":"postgres://postgres:postgres@localhost/pyramide",
        "migrationFolder":"migration",
        "migrationTable":"schema_migrations"
      }
    }
  });
  grunt.loadTasks("../tasks")
  grunt.registerTask("default",function(){
    console.log("default");
  })

};
