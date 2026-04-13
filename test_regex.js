const str = 'a \\frac b';
const replaced = str.replace(/(?<!\\)\\(frac)/g, '\\\\$1');
console.log(replaced);
