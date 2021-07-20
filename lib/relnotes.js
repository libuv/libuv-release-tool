
exports.generate = generate;
exports.prepare = prepare;
exports.read = read;
exports.filter = filter;
exports.reflow = reflow;


var fs = require('fs'),
    pad = require('./pad'),
    tag = require('./tags'),
    util = require('util'),
    ver = require('./version');


function generate(git, version, baseVersion, cb) {
  if (typeof version === 'string')
    version = ver.parse(version);
  if (typeof baseVersion === 'string')
    baseVersion = ver.parse(baseVersion);

  var baseTag = ver.format(baseVersion);
      date = new Date();
      output = "";

  output += util.format('%s.%s.%s, Version %s (%s)\n',
                        date.getUTCFullYear(),
                        pad(date.getUTCMonth() + 1, 2, '0'),
                        pad(date.getUTCDate(), 2, '0'),
                        ver.format(version).slice(1),
                        (version.suffix.length != 0 ? 'Pre-release' : 'Stable'));

  output += '\n';

  output += util.format('Changes since version %s:\n',
                        ver.format(baseVersion).slice(1));

  output += '\n';

  function findRefsToInclude(cb2) {
    var args = ['log',
                '--cherry',
                '--date-order',
                '--reverse',
                '--format=%H',
                baseTag + '...HEAD'
               ];

    git.exec(args, function(err, stdout) {
      if (err)
        return cb2(err);

      var refs = stdout.split(/[\s\r\n]+/);
      refs = refs.filter(function(v) {
        return !!v;
      });

      cb2(null, refs);
    });
  }

  function findRefsToIgnore(cb2) {
    git.exec(['log', '-i', '--grep', '^Now working on\\|^[0-9.]*, Version', '--format=%H'], function(err, stdout) {
      if (err)
        return cb2(err);

      var refs = stdout.split(/[\s\r\n]+/);
      refs = refs.filter(function(v) {
        return !!v;
      });

      cb2(null, refs);
    });
  }

  function addLog(args, refs, prefix, cb2) {
    args = ['log',
            '--cherry',
            '--no-walk=unsorted',
            '--stdin',
           ].concat(args || []);

    git.exec(args, refs.join('\n'), function(err, stdout) {
      if (err)
        return cb2(err);

      if (prefix) {
        stdout = prefix + stdout.replace(/\r?\n/g, '\n' + prefix);
      }

      output += stdout + '\n';
      cb2();
    });
  }

  findRefsToInclude(function(err, refs) {
    if (err)
      return cb(err);

    findRefsToIgnore(function(err, refsToIgnore) {
      if (err)
        return cb(err);

      // Remove any refs to ignore from list of refs.
      for (var i = 0; i < refsToIgnore.length; i++) {
        var index;
        while ((index = refs.indexOf(refsToIgnore[i])) !== -1)
          refs.splice(index, 1);
      }

      addLog(['--pretty=tformat:%w(79,0,2)* %s (%aN)%n'], refs, '', function(err) {
        if (err)
          return cb(err);

        addLog(['--decorate=short'], refs, '# ', function(err) {
          if (err)
            return cb(err);

          cb(null, output);
        });
      });
    });
  });
}


function filter(data, cb) {
  // Replace tabs by spaces.
  data = data.replace(/\t/g, '  ');
  // Change line endings to unix style. Strip comments and trailing whitespace.
  data = data.replace(/[ ]*(#.*)?(\r\n|\n\r|\n|\r|$)/g, '\n');
  // Remove excess newlines.
  data = data.replace(/\n{3,}/g, '\n\n');
  // Remove leading newlines
  data = data.replace(/^\n+/, '');
  // Make sure there's a newline after the last nonempty line.
  data = data.replace(/\n*$/, '\n');
  return data;
}


function reflow(data, maxWidth) {
  var output = '',
      currentParagraph = null;

  maxWidth = maxWidth || 80;

  newParagraph();
  filter(data).split(/\n/).forEach(processLine);
  newParagraph();

  return output;

  function processLine(line) {
    var m = /^(\s*)([*-]?)\s*/.exec(line),
        firstLineIndent = (m && m[1].length) || 0,
        bullet = (m && m[2]) || '',
        indent = (m && m[0].length) || 0;

    if (!line)
      return newParagraph();

    if (bullet || (currentParagraph.indent !== indent &&
                   currentParagraph.firstLineIndent !== indent))
      newParagraph({
        firstLineIndent: firstLineIndent,
        indent: indent,
        bullet: bullet
      });

    // Remove indent.
    line = line.slice(indent);

    // Join whitespace characters.
    line = line.replace(/\s+/g, ' ');

    if (line && currentParagraph.text)
      currentParagraph.text += ' ';

    currentParagraph.text += line;
  }

  function newParagraph(base) {
    // Process the previous paragraph.
    if (currentParagraph)
      processParagraph(currentParagraph);

    // Start a new one.
    currentParagraph = base || {};
    if (!currentParagraph.text)
      currentParagraph.text = '';
    if (!currentParagraph.bullet)
      currentParagraph.bullet = '';
    if (!currentParagraph.firstLineIndent)
      currentParagraph.firstLineIndent = 0;
    if (!currentParagraph.indent)
      currentParagraph.indent = 0;
    return currentParagraph;
  }

  function space(n) {
    return new Array(~~n + 1).join(' ');
  }

  function processParagraph(paragraph) {
    if (!paragraph.text)
      return;

    var text = paragraph.text,
        isFirstLine = true,
        width = maxWidth - paragraph.indent;

    if (output)
      output += '\n';

    while (text) {
      var line = text.slice(0, width + 1);
      if (line.length > width)
        line = line.replace(/ \S*$/, '')
      if (line.length > width)
        line = line.replace(/(\W+)\w+$/, function(m0, m1) {
          return m1;
        });
      if (line.legnth > width)
        line = line.slice(0, width);

      text = text.slice(line.length).replace(/^\s+/, '');

      if (isFirstLine) {
        output += space(paragraph.firstLineIndent)
        output += paragraph.bullet;
        output += space(paragraph.indent - paragraph.bullet.length -
                        paragraph.firstLineIndent);
        isFirstLine = false;
      } else {
        output += space(paragraph.indent);
      }

      output += line + '\n';
    }
  }
}


function prepare(git, version, baseVersion, cb) {
  git.top(function(err, dir) {
    if (err)
      return cb(err);

    var relNotesFile = dir + '/.git/RELNOTES';

    generate(git, version, baseVersion, function(err, relNotes) {
      if (err)
        return cb(err);

      fs.writeFile(relNotesFile, relNotes, function(err) {
        if (err)
          return cb(err);

        git.edit(relNotesFile, function(err, stdout) {
          if (err) {
            fs.unlink(relNotesFile, function() {});
            return cb(err);
          }

          read(git, version, function(err, data) {
            if (err) {
              fs.unlink(relNotesFile, function() {});
              return cb(err);
            }

            cb(null, data);
          });
        });
      });
    });
  });
}


function read(git, version, cb) {
  if (typeof version === 'string')
    version = ver.parse(version);

  git.top(function(err, dir) {
    if (err)
      return cb(err);

    var relNotesFile = dir + '/.git/RELNOTES';

    fs.readFile(relNotesFile, 'utf8', function(err, data) {
      if (err)
        return cb(err);

      data = filter(data);

      if (!/\S/.test(data))
        return cb(new Error("RELNOTES file is empty"));

      var versionString = util.format('Version %s ', ver.format(version).slice(1));

      if (data.indexOf(versionString) === -1)
        return cb(new Error("RELNOTES file isn't applicable to version " +
                            ver.format(version)));

      cb(null, data);
    });
  });
}
