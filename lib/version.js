
var fs = require('fs'),
    util = require('util'),
    semver = require('semver');


function updateVersionFile(filename, version, cb) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err)
      return cb(err);

    var output = '';

    data.split(/\r?\n/).forEach(function(line) {
      var match = /^(#define\s+\w+_version_(\w+)\s+)[A-Za-z0-9\"]+(\s*)$/i.exec(line);

      if (match) {
        var component = match[2].toLowerCase();
        if (version.hasOwnProperty(component)) {
          if (component != "suffix") {
            line = match[1] + Number(version[component]) + match[3];
          } else {
            line = match[1] + "\"" + version[component] + "\"" + match[3];
          }
        }
      }
      output += line + '\n';
    });

    output = output.replace(/\n+$/, '\n');

    fs.writeFile(filename, output, function(err) {
      cb(err);
    })
  });
}


function updateConfigureFile(filename, version, cb) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err)
      return cb(err);

    var output = '';

    data.split(/\r?\n/).forEach(function(line) {
      var match = /^(AC_INIT\(.*?\[)(\d+\.\d+\.\d+(?:\-[A-Za-z0-9]+)?)(\].*)/.exec(line);

      if (match) {
        line = match[1] +
               format(version).slice(1) +
               match[3];
      }
      output += line + '\n';
    });

    output = output.replace(/\n+$/, '\n');

    fs.writeFile(filename, output, function(err) {
      cb(err);
    })
  });
}


function updateAppVeyorFile(filename, version, cb) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err)
      return cb(err);

    var output = '';

    data.split(/\r?\n/).forEach(function(line) {
      var match = /^(version: v)(\d+\.\d+\.\d+(?:\-[A-Za-z0-9]+)?)(.*)/.exec(line);

      if (match) {
        line = match[1] +
               ver.format(version).slice(1) +
               match[3];
      }
      output += line + '\n';
    });

    output = output.replace(/\n+$/, '\n');

    fs.writeFile(filename, output, function(err) {
      cb(err);
    })
  });
}


function parse(name) {
  var match = semver.parse(name);

  if (!match)
    throw new RangeError("Tag name not parsable: " + name);

  return {
    major: match.major,
    minor: match.minor,
    patch: match.patch,
    suffix: match.prerelease.length == 1 ? match.prerelease[0] : "",
  };
}


function format(version) {
  var suffix = version.suffix ? util.format('-%s', version.suffix) : '';
  return util.format('v%d.%d.%d%s',
                     version.major,
                     version.minor,
                     version.patch,
                     suffix);
}


exports.updateVersionFile = updateVersionFile;
exports.updateConfigureFile = updateConfigureFile;
exports.updateAppVeyorFile = updateAppVeyorFile;
exports.parse = parse;
exports.format = format;
