const gulp = require('gulp')
const strip = require('gulp-strip-comments')
const rename = require('gulp-rename')
const replace = require('gulp-replace')

gulp.task('removeComments', function () {
  return gulp.src(['./modules/ozoneBidAdapter.js', './test/spec/modules/ozoneBidAdapter_spec.js', './modules/ozoneRtdProvider.js', './test/spec/modules/ozoneRtdProvider_spec.js', './modules/ozoneAnalyticsAdapter.js', './test/spec/modules/ozoneAnalyticsAdapter_spec.js'])
    .pipe(strip())
    .pipe(replace(/^\s*[\r\n]/gm, '')) // <- removes blank lines
    .pipe(rename({ extname: '.js.txt' }))
    .pipe(gulp.dest('dist_removed_comments'))
})

// exports.removeComments = removeComments;
