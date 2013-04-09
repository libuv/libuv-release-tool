
exports.addReleaseNotes = addReleaseNotes;
exports.addSHASums = addSHASums;

var fs = require('fs'),
    reflow = require('./relnotes').reflow;

function addReleaseNotes(git, releaseNotes, cb) {
  git.top(function(err, root) {
    if (err)
      return cb(err);

    var changeLogFile = root + '/ChangeLog';

    fs.readFile(changeLogFile, 'utf8', function(err, changeLog) {
      if (err)
        return cb(err);

      changeLog = changeLog.replace(/^\s+|\s+$/g, '');
      changeLog = reflow(releaseNotes, 79) + '\n\n' + changeLog + '\n';

      fs.writeFile(changeLogFile, changeLog, cb);
    });
  });
}


function addSHASums(git, cb) {
  git.top(function(err, root) {
    if (err)
      return cb(err);

    var changeLogFile = root + '/ChangeLog';

    fs.readFile(changeLogFile, 'utf8', function(err, changeLog) {
      if (err)
        return cb(err);

      update(changeLog, function(err, changeLog) {
        if (err)
          return cb(err);

        fs.writeFile(changeLogFile, changeLog, cb);
      });
    });
  });

  function update(changeLog, cb2) {
    var re = /(?:\n|^)\d+\.\d+\.\d+, Version ([\d.]+)(?:\s+\([^)]+\))(?!,)/i,
        match = re.exec(changeLog);

    if (!match)
      return cb2(null, changeLog);

    var header = match[0],
        tag = 'v' + match[1];

    git.exec(['log', '-n1', tag, '--format=%H'], function(err, stdout) {
      if (err)
        cb2(err);

      var hash = stdout.replace(/^\s+|\s+$/g, '');
      changeLog = changeLog.replace(header, header + ', ' + hash);

      update(changeLog, cb2);
    });
  }
}
