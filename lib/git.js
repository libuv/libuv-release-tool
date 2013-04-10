
exports.GitError = GitError;
exports.GitClient = GitClient;
exports.createClient = createClient;


var child_process = require('child_process'),
    path = require('path');


function GitError(exitCode, termSig, stderr) {
  var msg = 'Git failed: ';

  if (termSig) {
    msg += "killed with signal " + termSig;
  } else {
    msg += "exited with exit code " + exitCode;
  }

  if (stderr && /[^\r\n]/.test(stderr)) {
    msg += '\n\n' + stderr;
  }

  return Error.call(this, msg);
}
GitError.prototype = new Error();


function GitClient(dir) {
  dir = dir || '.';

  this.spawn = spawn;
  this.exec = exec;
  this.top = top;
  this.isClean = isClean;
  this.edit = edit;
  this.commit = commit;
  this.add = add;
  this.tag = tag;
  this.symbolicRef = symbolicRef;

  function spawn(args, options) {
    var gitBinary;

    if (process.platform !== 'win32')
      gitBinary = 'git';
    else
      gitBinary = 'git.exe'

    var opts = {
      cwd: dir
    };

    for (var key in options) {
      if (options.hasOwnProperty(key))
        opts[key] = options[key];
    }

    return child_process.spawn(gitBinary,
                               args || [],
                               opts);
  }

  function exec(args, stdin, cb) {
    var stdout = '',
        stderr = '';

    if (!cb) {
      cb = stdin;
      stdin = null;
    }

    var cp = spawn(args);

    cp.stdout.setEncoding('utf8');
    cp.stdout.on('data', function(s) {
      stdout += s;
    });

    cp.stderr.setEncoding('utf8');
    cp.stderr.on('data', function(s) {
      stderr += s;
    });

    cp.on('close', function(code, sig) {
      if (code || sig)
        return cb(new GitError(code, sig, stderr), stdout, stderr);

      // Success.
      cb(null, stdout, stderr);
    });

    if (stdin)
      cp.stdin.end(stdin);
  }

  function top(cb) {
    exec(['rev-parse', '--show-toplevel'], function(err, output) {
      if (err)
        return cb(err);

      var dir = path.resolve(output.replace(/[\r\n]+$/, ''));
      cb(null, dir);
    });
  }

  function isClean(cb) {
    exec(['status', '--porcelain', '-uno'], function(err, output) {
      if (err)
        return cb(err);

      if (/\S/.test(output))
        cb(null, false);
      else
        cb(null, true);
    });
  }

  function edit(file, cb) {
    exec(['config', 'core.editor'], function(err, output) {
      var editor = output.replace(/^\s+|\s+$/g, '') ||
                   process.env.GIT_EDITOR ||
                   process.env.EDITOR ||
                   'vi',
          shell;

      if (process.platform === 'win32') {
        shell = "cmd";
        args = ['/s', '/c', '"' + editor.replace(/'/g, '"') + ' "' + file + '""'];
      } else {
        shell = 'sh';
        args = ['-c', editor + ' "' + file + '"'];
      }

      var cp = child_process.spawn(shell,
                                   args,
                                   { stdio: 'inherit',
                                     windowsVerbatimArguments: true });

      cp.on('exit', function(exitCode, termSig) {
        if (exitCode || termSig) {
          return cb(new Error("Failed to run editor: " + editor))
        }

        cb();
      });
    });
  }

  function add(files, cb) {
    // Paths are interpreted relative to the git top dir.
    top(function(err, dir) {
      if (err)
        return cb(err);

      files = files.map(function(filename) {
        return path.resolve(dir, filename);
      });

      var args = ['add', '--'].concat(files);

      exec(args, cb);
    });
  }

  function commit(args, message, cb) {
    args = ['commit', '-F', '-'].concat(args || []);
    exec(args, message, cb);
  }

  function tag(argsOrTagName, message, cb) {
    var args = ['tag'].concat(argsOrTagName).concat(['-F', '-']);
    exec(args, message, cb);
  }

  function symbolicRef(ref, cb) {
    if (!cb && typeof ref === 'function') {
      cb = ref;
      ref = 'HEAD';
    }

    exec(['symbolic-ref', ref], function(err, stdout) {
      if (err)
        return cb(err);

      stdout = stdout.replace(/^\s+|\s+$/g, '');

      cb(null, stdout);
    });
  }
}


function createClient(dir) {
  return new GitClient(dir);
}
