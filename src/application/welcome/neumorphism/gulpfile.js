import gulp from 'gulp';
import browserSync from 'browser-sync';
import gulpSass from 'gulp-sass';
import sass from 'sass';
import cssnano from 'gulp-cssnano';
import autoprefixer from 'gulp-autoprefixer';
import concat from 'gulp-concat';
import rename from 'gulp-rename';
import uglify from 'gulp-uglify';
import { spawn } from 'child_process';

const browserSyncInstance = browserSync.create();
const sassCompiler = gulpSass(sass);

/**
 * Compile and minify sass
 */
function styles() {
  return gulp
    .src(['_sass/*.scss'])
    .pipe(
      sassCompiler({
        includePaths: ['scss'],
        onError: browserSyncInstance.notify
      })
    )
    .pipe(autoprefixer({ overrideBrowserslist: ['defaults', 'last 2 versions', '> 0.2%', 'not dead', 'not op_mini all'], cascade: true }))
    .pipe(rename('main.min.css'))
    .pipe(cssnano())
    .pipe(gulp.dest('_site/assets/css/'))
    .pipe(browserSyncInstance.reload({ stream: true }))
    .pipe(gulp.dest('assets/css'));
}

function stylesVendors() {
  return gulp
    .src(['_sass/vendors/*.css'])
    .pipe(concat('vendors.min.css'))
    .pipe(cssnano())
    .pipe(gulp.dest('_site/assets/css/'))
    .pipe(gulp.dest('assets/css'));
}

/**
 * Compile and minify js
 */
function scripts() {
  return gulp
    .src(['_js/app.js'])
    .pipe(rename('app.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('_site/assets/js'))
    .pipe(browserSyncInstance.reload({ stream: true }))
    .pipe(gulp.dest('assets/js'));
}

function scriptsVendors() {
  return gulp
    .src(['_js/vendors/*.js'])
    .pipe(concat('vendors.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('_site/assets/js'))
    .pipe(gulp.dest('assets/js'));
}

/**
 * Server functionality handled by BrowserSync
 */
function browserSyncServe(done) {
  browserSyncInstance.init({
    server: '_site',
    port: 4000
  });
  done();
}

function browserSyncReload(done) {
  browserSyncInstance.reload();
  done();
}

/**
 * Build Jekyll site
 */
function jekyll(done) {
  return spawn(
    'bundle',
    ['exec', 'jekyll', 'build', '--incremental', '--config=_config.yml'],
    { stdio: 'inherit' }
  ).on('close', done);
}

/**
 * Watch source files for changes & recompile
 * Watch html/md files, run Jekyll & reload BrowserSync
 */
function watchData() {
  gulp.watch(['_data/*.yml', '_config.yml', 'assets/*.json'], gulp.series(jekyll, browserSyncReload));
}

function watchMarkup() {
  gulp.watch(['index.html', '_includes/*.html', '_layouts/*.html'], gulp.series(jekyll, browserSyncReload));
}

function watchScripts() {
  gulp.watch(['_js/*.js'], scripts);
}

function watchStyles() {
  gulp.watch(['_sass/*.scss'], styles);
}

const compile = gulp.parallel(styles, stylesVendors, scripts, scriptsVendors);
const serve = gulp.series(compile, jekyll, browserSyncServe);
const watchTask = gulp.parallel(watchData, watchMarkup, watchScripts, watchStyles);

/**
 * Default task, running just `gulp` will compile the sass,
 * compile the Jekyll site, launch BrowserSync & watch files.
 */
gulp.task('default', gulp.parallel(serve, watchTask));
gulp.task('compile', gulp.parallel(compile, jekyll));