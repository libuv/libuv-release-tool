
exports.checkSanity = checkSanity;
exports.getBase = getBase;


var assert = require('assert'),
    git = require('./git'),
    ver = require('./version'),
    util = require('util');


function checkSanity(git, nextVersion, cb) {
  var nextTagName;

  if (typeof nextVersion === 'object') {
    // Version object
    nextTagName = ver.format(nextVersion);
  } else {
    // Tag name
    nextTagName = nextVersion;
    try {
      nextVersion = ver.parse(nextTagName);
    } catch (e) {
      return error(e);
   }
  }

  var tagPrefix = util.format('v%d.%d.*', nextVersion.major, nextVersion.minor);

  git.exec(['tag', '-l', tagPrefix], function(err, data) {
    if (err)
      return error(err);

    var seenPatches = [];

    data.split(/\r?\n/).forEach(function(tag) {
      // Ignore impty lines
      if (tag === '')
        return;

      // Try to parse the tag name
      try {
        var version = ver.parse(tag);
      } catch (e) {
        return error(e);
      }

      assert(!seenPatches[version.patch]);
      seenPatches[version.patch] = true;
    });

    /* Verify that all tags are linear. */
    for (var i = 0; i < seenPatches.length; i++) {
      if (!seenPatches[i])
        console.warn('Warning: no tag with patch level ' + i + ' found.');
    }

    /* Verify that the new patch fits in. */
    if (nextVersion && nextVersion.patch > seenPatches.length) {
      var msg = util.format('New tag has patch level %d, ' +
                            'but no tag with patch level %d was found',
                            nextVersion.patch,
                            nextVersion.patch - 1)
      return error(new Error(msg));
    } else if (nextVersion && nextVersion.patch < seenPatches.length) {
      var msg = util.format('Tag for patch level %d already exists',
                            nextVersion.patch);
      return error(new Error(msg));
    }

    cb && cb();
  });

  function error(err) {
    cb && cb(err);
    cb = null;
  }
}


function getBase(git, version, cb) {
  var match;

  if (version.patch > 0) {
    match = util.format('v%d.%d.%d', version.major, version.minor, version.patch - 1);
  } else {
    match = util.format('v%d.*.*', version.major);
  }

  git.exec(['describe', '--abbrev=0', '--candidates=9999', '--match', match],
    function(err, output) {
      if (err)
        return cb(err);

      var baseTag = output.replace(/^\s+|\s+$/g, '');
      cb(null, baseTag);
    });
}
