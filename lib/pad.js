
function pad(s, n, c) {
  s = '' + s;

  n = n - s.length + 1;
  if (n <= 0)
    return s;

  if (c === undefined) {
    c = ' ';
  } else {
    c = ('' + c).charAt(0);
  }

  return Array(n).join(c) + s;
}

module.exports = pad;