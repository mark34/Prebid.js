import gulp from 'gulp'
import strip from 'gulp-strip-comments'
import rename from 'gulp-rename'
import replace from 'gulp-replace'

/*
To run this :

gulp removeComments
 */

gulp.task('removeComments', function () {
  return gulp.src(['./modules/ozoneBidAdapter.js', './test/spec/modules/ozoneBidAdapter_spec.js'])
    .pipe(strip())
    .pipe(replace(/^\s*[\r\n]/gm, '')) // <- removes blank lines
    .pipe(replace(/[ \t]+$/gm, ''))        // Remove trailing spaces/tabs
    .pipe(rename({ extname: '.js.txt' }))
    .pipe(gulp.dest('dist_removed_comments'))
})

// exports.removeComments = removeComments;
