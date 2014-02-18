#!/usr/bin/env node

var child_process = require('child_process'),
    format = require('util').format,
    path = require('path'),
    resolve = require('path').resolve,
    git = require('./lib/git'),
    ver = require('./lib/version'),
    tags = require('./lib/tags'),
    relnotes = require('./lib/relnotes'),
    changelog = require('./lib/changelog'),
    argv = require('optimist').argv,
    progress = require('./lib/progress'),
    authors = require('./lib/authors');


var SCHEDULE = [
  verifyTreeClean,
  setReleaseVersion,
  checkTagSanity,
  getBaseVersion,
  updateAuthorsAndMailmap,
  updateVersionFiles,
  prepareReleaseNotes,
  addReleaseNotesToChangeLog,
  stageVersionFiles,
  stageChangeLog,
  stageAuthorsAndMailmap,
  commitRelease,
  tagRelease,
  addSHASumsToChangeLog,
  bumpToPreVersion,
  updateVersionFiles,
  stageChangeLog,
  stageVersionFiles,
  commitVersionBump,
  reviewTagAndCommits,
  createWebsiteDirectory,
  pushTag,
  pushBranch,
  uploadTarBall,
  done
];


if (!argv.dir) {
  logError('Usage: release.js --dir <directory> [--continue | --abort ]');
  return process.exit(1);
}

var dir = resolve(argv.dir),
    gitClient = git.createClient(dir),
    state = progress.state;


progress.read(gitClient, function(err) {
  if (err)
    throw err;

  if (state.step === undefined) {
    if (argv['abort'] || argv['continue']) {
      logError('No release in progress.');
      return process.exit(1);
    }

    state.step = 0;
    state.argv = argv;
    step();

  } else {
    if (argv['abort'])
      abort();
    else if (argv['continue'])
      step();
    else {
      logError('Looks like release is in progress. Use the --continue or --abort option.');
      return process.exit(1);
    }
  }
});


function step() {
  var steps = SCHEDULE;

  if (state.step >= steps.length) {
    progress.destroy(gitClient, function(err) {
      if (err)
        throw err;
    });

  } else {
    progress.write(gitClient, function(err, cb) {
      if (err)
        throw err;

      try {
        console.log('... %s', steps[state.step].name);
        steps[state.step]();
      } catch (err) {
        abort(err);
      }
    })
  }
}


function logError() {
  if (!arguments.length)
    return;

  var args = Array.prototype.slice.call(arguments, 0);
  args = args.map(function(arg) {
    if (arg && arg.message && arg.stack)
      return arg.message + '\n' + arg.stack;
    return arg;
  });

  console.error.apply(console, args);
}


function pauseNext() {
  var args = arguments;

  state.step++;

  progress.write(gitClient, function(err, cb) {
    if (err)
      throw err;

    if (args.length) {
      logError('');
      logError.apply(null, args);
    }

    logError('Use `release.js --dir "%s" --continue` when done, or `--abort` to abort.',
             dir);
  });
}

function pauseRetry() {
  var args = arguments;

  progress.write(gitClient, function(err, cb) {
    if (err)
      throw err;

    if (args.length) {
      logError('');
      logError.apply(null, args);
    }

    logError('Use `release.js --dir "%s" --continue` to retry, or `--abort` to abort.',
             dir);
  });
}


function next() {
  state.step++;
  step();
}

function abort() {
  var args = arguments;

  progress.destroy(gitClient, function(err) {
    if (err)
      throw err;

    logError.apply(null, args);
    logError('aborted');
  });
}

function nextOrAbort(err) {
  if (err)
    return abort(err);

  next();
}

function nextOrRetry(err) {
  if (err)
    return pauseRetry(err);

  next();
}

function verifyTreeClean() {
  gitClient.isClean(function(err, clean) {
    if (err)
      return abort(err);

    if (!clean)
      return abort("The working tree is not clean. Please stash or commit " +
                   "your work before making a release.");

    next();
  });
}


function setReleaseVersion() {
  // If the user specified a particular version on the command line,
  // use it. Otherwise use the -pre version in libuv.c.

  if (state.argv.version) {
    var version;

    try {
      version = ver.parse(state.argv.version);
    } catch (e) {
      return abort(e);
    }

    if (!version.is_release)
      return abort("You probably don't want to release a pre-release " +
                   "version");

    version.is_release = true;
    state.releaseVersion = version;
    state.version = clone(state.releaseVersion);

    next();

  } else {
    gitClient.top(function(err, root) {
      if (err)
        return abort(err);

      var vfile = path.join(root, 'include', 'uv-version.h';

      if (!fs.existsSync(vfile))
        vfile = path.join(root, 'src', 'version.c');

      ver.parseVersionFile(vfile, function(err, version) {
        if (err)
          return abort(err);

        if (version.is_release)
          return abort('version.c currently contains a release version. ' +
                       'You probably want to bump this to a non-release version');

        version.is_release = true;
        state.releaseVersion = version;
        state.version = clone(state.releaseVersion);

        next();
      });
    });
  }
}


function checkTagSanity() {
  tags.checkSanity(gitClient, state.version, nextOrAbort);
}


function getBaseVersion() {
  tags.getBase(gitClient, state.version, function(err, baseTag) {
    if (err)
      return abort(err);

    var baseVersion;

    try {
      var baseVersion = ver.parse(baseTag);
    } catch (e) {
      return abort(e);
    }

    state.baseVersion = baseVersion;
    next();
  });
}


function updateVersionFiles() {
  gitClient.top(function(err, root) {
    if (err)
      return abort(err);

    var waiting = 3,
        failed = false;

    ver.updateVersionFile(root + '/src/version.c', state.version, afterUpdate);
    ver.updateVersionFile(root + '/include/uv.h', state.version, afterUpdate);
    ver.updateConfigureFile(root + '/configure.ac',
                            state.version,
                            afterConfigureUpdate);

    function afterConfigureUpdate(err) {
      // Because configure.ac is only included as of v0.11.6, don't complain if
      // if the file is not found and we're releasing from an older branch.
      if (err &&
          err.code === 'ENOENT' &&
          state.version.major === 0 &&
          state.version.minor <= 10) {
        state.configureAcFileMissing = true;
        err = null;
      }

      return afterUpdate(err);
    }

    function afterUpdate(err) {
      if (failed)
        return;

      if (err)
        return failed = true, abort(err);

      if (!--waiting)
        next();
    }
  });
}


function updateAuthorsAndMailmap() {
  authors.updateAuthors(gitClient, function(err, madeChanges) {
    if (err)
      return abort(err);

    if (!madeChanges)
      return next();

    gitClient.top(function(err, dir) {
      if (err)
        return abort(err);

      var cp = gitClient.spawn(['--no-pager', 'diff', 'AUTHORS', '.mailmap'], { cwd: dir, stdio: 'inherit' });

      cp.on('close', function() {
        pauseNext("Changes were made to AUTHORS or .mailmap. Please review these.");
      });
    });
  });
}


function prepareReleaseNotes() {
  relnotes.prepare(gitClient, state.version, state.baseVersion, function(err, text) {
    if (err)
      return abort(err);

    state.releaseNotes = text;
    next();
  });
}


function addReleaseNotesToChangeLog() {
  changelog.addReleaseNotes(gitClient, state.releaseNotes, nextOrAbort);
}

function addSHASumsToChangeLog() {
  changelog.addSHASums(gitClient, nextOrAbort);
}

function commitRelease() {
  var message = relnotes.reflow(state.releaseNotes, 72);

  gitClient.commit([], message, nextOrAbort);
}

function tagRelease() {
  var releaseTag = state.releaseTag = ver.format(state.version);
  var message = relnotes.reflow(state.releaseNotes, 79);

  gitClient.tag([releaseTag, '-as'], message, nextOrRetry);
}

function stageVersionFiles() {
  var files = ['src/version.c', 'include/uv.h'];
  if (!state.configureAcFileMissing)
    files.push('configure.ac');

  gitClient.add(files, nextOrAbort);
}


function stageAuthorsAndMailmap() {
  gitClient.add(['AUTHORS', '.mailmap'], nextOrAbort);
}


function stageChangeLog() {
  gitClient.add(['ChangeLog'], nextOrAbort);
}

function bumpToPreVersion() {
  state.version.is_release = false;
  state.version.patch++;
  next();
}

function commitVersionBump() {
  var nextReleaseVersion = clone(state.version);
  nextReleaseVersion.is_release = true;

  var message = "Now working on " + ver.format(nextReleaseVersion);

  gitClient.commit([], message, nextOrAbort);
}


function reviewTagAndCommits() {
  gitClient.top(function(err, dir) {
    if (err)
      return abort(err);

    var cp = gitClient.spawn(['--no-pager', 'show', state.releaseTag, 'HEAD'], { cwd: dir, stdio: 'inherit' });

    cp.on('close', function() {
      pauseNext('Please review the tag and the commits that are about to be pushed.');
    });
  });
}


function createWebsiteDirectory() {
  var tag = ver.format(state.releaseVersion);
  var dir = '~/www/dist/' + tag;

  child_process.execFile('ssh', ['libuv@libuv.org', 'mkdir -p ' + dir], { stdio: 'inherit' }, nextOrRetry);
}


function uploadTarBall() {
  var tag = ver.format(state.releaseVersion);
  var filename = format('~/www/dist/%s/libuv-%s.tar.gz', tag, tag);
  var prefix = format('libuv-%s/', tag);
  var command = format('git archive %s --format=tar --prefix=%s | gzip -9 | ssh libuv@libuv.org "cat > %s"',
                       tag,
                       prefix,
                       filename);
  child_process.exec(command, { stdio: 'inherit', cwd: dir}, nextOrRetry);
}


function pushTag() {
  var remote = state.argv.remote || 'origin';
  gitClient.exec(['push', remote, state.releaseTag], nextOrRetry);
}


function pushBranch() {
  var remote = state.argv.remote || 'origin';

  gitClient.symbolicRef(function(err, ref) {
    if (err)
      return abort(err);

    var branch = ref.replace(/^refs\/heads\//, '');

    if (branch !== 'master' &&
        state.releaseTag.indexOf(branch + '.') !== 0) {

      logError("Not pushing the current branch, because I couldn't decide which branch to push.\n" +
               "You'll have to do it yourself.",
               "You are currently on branch: " + (branch || 'DETACHED HEAD'));

      pauseNext();
    } else {
      gitClient.exec(['push', remote, branch], nextOrRetry);
    }
  });
}

function done() {
  logError('We\'re done!');
  next();
}


function clone(obj) {
  var tgt = {};

  for (var key in obj) {
    if (obj.hasOwnProperty(key))
      tgt[key] = obj[key]
  }

  return tgt;
}
