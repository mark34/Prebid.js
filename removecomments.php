<?php
/*
 * Create a duplicate version of the ozone adapter & spec files removing specific areas
 *
 *
 * Remove all the following:
// --- START REMOVE FOR RELEASE
// --- END REMOVE FOR RELEASE

 *
 */

$src = file('./modules/ozoneBidAdapter.js');
$spec = file('./test/spec/modules/ozoneBidAdapter_spec.js');
$srcOut = './ozoneBidAdapter.js.nocomments-' . date("Y-m-d_H_i_s") . '.txt';
$specOut = './ozoneBidAdapter_spec.js.nocomments-' . date("Y-m-d_H_i_s") . '.txt';
file_put_contents($srcOut, '');
file_put_contents($specOut, '');
$writeLine = true;
foreach([$srcOut => $src, $specOut => $spec] as $out => $arr) {
    foreach($arr as $line) {
        if(strpos($line, '--- START REMOVE FOR RELEASE') !== false ) {
            $writeLine = false;
            continue;
        }
        if(strpos($line, '--- END REMOVE FOR RELEASE') !== false ) {
            $writeLine = true;
            continue;
        }
        if($writeLine) {
            file_put_contents($out, $line, FILE_APPEND);
        }
    }
}

print "\n\nFILES GENERATED : \n";
print $srcOut . "\n";
print $specOut . "\n";




