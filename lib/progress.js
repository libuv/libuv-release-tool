
exports.read = read;
exports.write = write;
exports.destroy = destroy;
exports.clean = clean;

var state = exports.state = {};

var fs = require('fs');


function read(git, cb) {
  git.top(function(err, dir) {
    if (err)
      return cb(err);

    fs.readFile(dir + '/.git/.release-progress', 'utf8', function(err, json) {
      if (err && err.code !== 'ENOENT')
        return cb(err);

      if (err)
        return cb(null, null);

      try {
        var data = JSON.parse(json);
      } catch (e) {
        return cb(e);
      }

      clean();
      for (var key in data) {
        if (data.hasOwnProperty(key))
          state[key] = data[key];
      }

      cb(null);
    });
  });
}


function write(git, cb) {
  git.top(function(err, dir) {
    if (err)
      return cb(err);

    var json = JSON.stringify(state);

    fs.writeFile(dir + '/.git/.release-progress', json, function(err) {
      if (err)
        return cb(err);

      cb(null);
    });
  });
}


function destroy(git, cb) {
  git.top(function(err, dir) {
    if (err)
      return cb(err);

    fs.unlink(dir + '/.git/.release-progress', function(err) {
      if (err && err.code !== 'ENOENT')
        return cb(err);

      clean();
      cb(null);
    });
  });
}


function clean() {
  for (var key in state) {
    if (state.hasOwnProperty(key))
      delete state[key];
  }
}