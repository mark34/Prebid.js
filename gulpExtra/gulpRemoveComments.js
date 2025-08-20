'use strict'
/*
To run this :

gulp removeComments
 */

// IMPORTANT: This file deliberately uses no `require` or `import`.
// Gulpfile sets the following globals before loading this file:
//   global.gulp, global.strip, global.replace, global.rename

const gulp = globalThis.gulp
const strip = globalThis.strip
const replace = globalThis.replace
const rename = globalThis.rename

gulp.task('removeComments', function () {
  return gulp.src(['./modules/ozoneBidAdapter.js', './test/spec/modules/ozoneBidAdapter_spec.js'])
    .pipe(strip())
    .pipe(replace(/^\s*[\r\n]/gm, '')) // <- removes blank lines
    .pipe(replace(/[ \t]+$/gm, ''))        // Remove trailing spaces/tabs
    .pipe(rename({ extname: '.js.txt' }))
    .pipe(gulp.dest('dist_removed_comments'))
})
