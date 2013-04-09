
exports.updateAuthors = updateAuthors;

var fs = require('fs'),
    format = require('util').format;

function updateAuthors(git, cb) {
  git.top(function(err, dir) {
    if (err)
      return cb(err);

    var gitAuthors, fileAuthors;

    function split(data) {
      var lines = data.split(/[\t \r]*\n/);

      lines = lines.filter(function(line) {
        return line && !/^#/.test(line);
      });

      return lines;
    }

    git.exec(['log', 'HEAD' , '--reverse', '--date-order', '--pretty=%aN <%aE>'], function(err, output) {
      if (err)
        cb(err);

      gitAuthors = split(output);
      afterListAuthors();
    });


    fs.readFile(dir + '/AUTHORS', 'utf8', function(err, data) {
      if (err)
        return cb(err);

      fileAuthors = split(data);
      afterListAuthors();
    });


    function afterListAuthors() {
      if (!gitAuthors || !fileAuthors)
        return;

      var fileAdditions = [],
          mailmapAdditions = [],
          authorNameIndex = {},
          authorEmailIndex = {},
          mappingIndex = {},
          splitAuthorRe = /^\s*(.*?)\s*(?:\<(.*)\>)/,
          i;

      // Index the file authors by name and email. Warn if an author was found
      // multiple times.
      for (i = 0; i < fileAuthors.length; i++) {
        var author = fileAuthors[i],
            result = splitAuthorRe.exec(author);

        if (!result)
          return cb(new Error('Invalid author in AUTHORS file: ' + author));

        var authorName = result[1],
            authorEmail = result[2],
            authorNameKey = result[1].toLowerCase(),
            authorEmailKey = result[2].toLowerCase();

        if (authorNameIndex.hasOwnProperty(authorNameKey))
          console.warn('Warning: author name appears twice in AUTHORS file: %s', authorName);
        if (authorEmailIndex.hasOwnProperty(authorEmailKey))
          console.warn('Warning: author email appears twice in AUTHORS file: %s', authorEmail);

        authorNameIndex[authorNameKey] = { name: authorName, email: authorEmail };
        authorEmailIndex[authorEmailKey] = { name: authorName, email: authorEmail };
      }

      // Remove entries that are already in the authors file.
      // When a name is found that is already listed in the AUTHORS with a
      // different name or e-mail address, add it to the mailmap.
      for (i = 0; i < gitAuthors.length; i++) {
        var author = gitAuthors[i],
            result = splitAuthorRe.exec(author);

        if (!result)
          return cb(new Error('Invalid author in git output: ' + author));

        var authorName = result[1],
            authorEmail = result[2],
            authorNameKey = result[1].toLowerCase(),
            authorEmailKey = result[2].toLowerCase();

        var knownAuthor = authorNameIndex[authorNameKey] ||
                          authorEmailIndex[authorEmailKey];

        if (!knownAuthor) {
          // New author. Add to authors.
          fileAdditions.push(author);
          authorEmailIndex[authorEmailKey] = { name: authorName, email: authorEmail };
          authorNameIndex[authorNameKey] = { name: authorName, email: authorEmail };
        } else {
          // Known author. See if we need it to add to the mailmap.
          if (authorEmail !== knownAuthor.email) {
            var mapping = format('%s <%s> <%s>',
                                 knownAuthor.name,
                                 knownAuthor.email,
                                 authorEmail);
            if (mailmapAdditions.indexOf(mapping) === -1)
              mailmapAdditions.push(mapping);
            authorEmailIndex[authorEmailKey] = knownAuthor;
          } else if (authorName !== knownAuthor.name) {
            var mapping = format('%s <%s>',
                                 knownAuthor.name,
                                 authorEmail);
            if (mailmapAdditions.indexOf(mapping) === -1)
              mailmapAdditions.push(mapping);
            authorNameIndex[authorNameKey] = knownAuthor;
          }
        }
      }

      var waiting = 0;

      // If there are any additions to the mailmap, save them.
      if (mailmapAdditions.length) {
        waiting++;

        fs.readFile(dir + '/.mailmap', 'utf8', function(err, data) {
          if (err)
            return cb(err);

          var lines = data.split(/\s*\n\s*/);
          lines = lines.concat(mailmapAdditions);
          lines = lines.filter(function(s) {
            return !!s;
          });
          lines.sort();

          data = lines.join('\n') + '\n';

          fs.writeFile(dir + '/.mailmap', data, afterWrite);
        });
      }

      // If there are any additions to the authors file, add them.
      if (fileAdditions.length) {
        waiting++;

        var data = fileAdditions.join('\n') + '\n';
        fs.appendFile(dir + '/AUTHORS', data, afterWrite);
      }

      function afterWrite(err) {
        if (err)
          return cb(err);

        if (!--waiting)
          cb(null, true);
      }

      if (!waiting)
        cb(null, false);
    }
  });
}
