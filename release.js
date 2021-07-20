#!/usr/bin/env node

var child_process = require('child_process'),
    format = require('util').format,
    fs = require('fs'),
    os = require('os'),
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
  reviewTagAndCommits,
  createDistDirectory,
  createCMakeTarBall,
  createAutotoolsTarBall,
  signTarballs,
  createWebsiteDirectory,
  pushTag,
  pushBranch,
  uploadTarBalls,
  done
];


if (!argv.dir || !argv.version) {
  logError('Usage: release.js --version <version> --dir <directory> [--continue | --abort ]');
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
    var version;

    try {
      version = ver.parse(state.argv.version);
    } catch (e) {
      return abort(e);
    }

    version.is_release = true;
    state.releaseVersion = version;
    state.version = clone(state.releaseVersion);

    next();
}


function checkTagSanity() {
  //tags.checkSanity(gitClient, state.version, nextOrAbort);
  // TODO
  next();
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

    var waiting = 2,
        failed = false;

    ver.updateVersionFile(root + '/include/uv/version.h', state.version, afterUpdate);
    ver.updateConfigureFile(root + '/configure.ac', state.version,  afterUpdate);

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
  changelog.addSHASums(gitClient, function(err) {
    if (err)
      return abort(err);

    gitClient.add(['ChangeLog'], function(err) {
      if (err)
        return abort(err);

      gitClient.commit([], 'Add SHA to ChangeLog', nextOrAbort);
    });

  });
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
  var files = ['configure.ac', 'include/uv/version.h'];

  gitClient.add(files, nextOrAbort);
}


function stageAuthorsAndMailmap() {
  gitClient.add(['AUTHORS', '.mailmap'], nextOrAbort);
}


function stageChangeLog() {
  gitClient.add(['ChangeLog'], nextOrAbort);
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

  child_process.execFile('ssh', ['libuv@dist.libuv.org', 'mkdir -p ' + dir], { stdio: 'inherit' }, nextOrRetry);
}


function createDistDirectory() {
  var distdir = dir + '/dist';
  fs.mkdir(distdir, function(err) {
    if (err && err.code !== 'EEXIST')
      return pauseRetry(err);
    if (fs.readdirSync(distdir).length !== 0)
      return pauseRetry("dist dir is not empty");

    next();
  });
}


function createCMakeTarBall() {
  var tag = ver.format(state.releaseVersion);
  var filename = format('libuv-%s.tar.gz', tag);
  var prefix = format('libuv-%s/', tag);
  var command = format('git archive %s --format=tar --prefix=%s | gzip -9 > dist/%s',
                       tag,
                       prefix,
                       filename);
  child_process.exec(command, { stdio: 'inherit', cwd: dir }, nextOrRetry);
}


function createAutotoolsTarBall() {
  var tag = ver.format(state.releaseVersion);
  var distver = format('%d.%d.%d',
                       state.releaseVersion.major,
                       state.releaseVersion.minor,
                       state.releaseVersion.patch);
  child_process.execFile('./autogen.sh', [], { stdio: 'inherit', cwd: dir },
                         function(err, stdout, stderr) {
    if (err) {
      console.log(stdout);
      console.log(stderr);
      return pauseRetry(err);
    }
    try {
      var builddir = fs.mkdtempSync(path.join(os.tmpdir(), 'libuv-build-'));
      console.log('    attempting build in %s', builddir);
    } catch (err) {
      return pauseRetry(err);
    }
    child_process.execFile(dir + '/configure', [],
                           { stdio: 'inherit', cwd: builddir },
                           function(err, stdout, stderr) {
      if (err) {
        console.log(stdout);
        console.log(stderr);
        return pauseRetry(err);
      }
      child_process.execFile('make', ['dist', '-j' + os.cpus().length], // TODO: use distcheck here
                             { stdio: 'pipe', cwd: builddir },
                             function(err, stdout, stderr) {
        if (err) {
          console.log(stdout);
          console.log(stderr);
          return pauseRetry(err);
        }
        var srcfilename = path.join(builddir, format('libuv-%s.tar.gz', distver));
        var dstfilename = path.join(dir, 'dist', format('libuv-%s-dist.tar.gz', tag));
        try {
          fs.renameSync(srcfilename, dstfilename);
          fs.rmdirSync(builddir, { recursive: true }); // in future nodejs, this will be called rmSync
        } catch (err) {
          return pauseRetry(err);
        }
        next();
      });
    });
  });
}


function signTarballs() {
  var tag = ver.format(state.releaseVersion);
  var filename = format('dist/libuv-%s.tar.gz', tag);
  var signFilename = filename + ".sign";
  var args = ['-a', '--output', signFilename, '--detach-sign', filename];
  child_process.execFile('gpg', args, { stdio: 'inherit', cwd: dir }, function(err) {
    if (err)
      return pauseRetry(err);
    var filename = format('dist/libuv-%s-dist.tar.gz', tag);
    var signFilename = filename + ".sign";
    var args = ['-a', '--output', signFilename, '--detach-sign', filename];
    child_process.execFile('gpg', args, { stdio: 'inherit', cwd: dir }, nextOrRetry);
  });
}


function uploadTarBalls() {
  var tag = ver.format(state.releaseVersion);
  var baseFilename = format('libuv-%s.tar.gz', tag);
  var directory = format('~/www/dist/%s/', tag);
  var args = [format('dist/%s*', baseFilename),
              "libuv@dist.libuv.org:" + directory];
  child_process.execFile('scp', args, { stdio: 'inherit', cwd: dir }, nextOrRetry);
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
    gitClient.exec(['push', remote, branch], nextOrRetry);
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
