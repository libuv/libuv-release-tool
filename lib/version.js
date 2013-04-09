
var fs = require('fs'),
    util = require('util');


function parseFile(filename, cb) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err)
      return cb(err);

    var version = {};

    data.split(/\r?\n/).forEach(function(line) {
      var match = /^#define\s+\w+_version_(\w+)\s+(\d+)\s*$/i.exec(line);
      if (match) {
        var component = match[1].toLowerCase();
        var value = +match[2];
        version[component] = value;
      }
    });

    cb(null, version);
  });
}


function updateFile(filename, version, cb) {
  fs.readFile(filename, 'utf8', function(err, data) {
    if (err)
      return cb(err);

    var output = '';

    data.split(/\r?\n/).forEach(function(line) {
      var match = /^(#define\s+\w+_version_(\w+)\s+)\d+(\s*)$/i.exec(line);

      if (match) {
        var component = match[2].toLowerCase();
        if (version.hasOwnProperty(component)) {
          line = match[1] + Number(version[component]) + match[3];
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


function parse(name) {
  var match = /^v?(\d+)\.(\d+).(\d+)(-pre)?$/.exec(name);

  if (!match)
    throw new RangeError("Tag name not parsable: " + name);

  return {
    major: +match[1],
    minor: +match[2],
    patch: +match[3],
    is_release: +!match[4]
  };
}


function format(version) {
  return util.format('v%d.%d.%d%s',
                     version.major,
                     version.minor,
                     version.patch,
                     version.is_release ? '' : '-pre');
}


exports.parseFile = parseFile;
exports.updateFile = updateFile;
exports.parse = parse;
exports.format = format;
