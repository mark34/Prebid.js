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

$arrConfig = [
    ['in' => './modules/ozoneBidAdapter.js', 'out' => './ozoneBidAdapter.js.' . date("Y-m-d_H_i_s") . '.txt'],
    ['in' => './test/spec/modules/ozoneBidAdapter_spec.js', 'out' => './ozoneBidAdapter_spec.js.' . date("Y-m-d_H_i_s") . '.txt']
//    ,
//    ['in' => './modules/newspassidBidAdapter.js', 'out' => './newspassidBidAdapter.js.' . date("Y-m-d_H_i_s") . '.txt'],
//    ['in' => './test/spec/modules/newspassidBidAdapter_spec.js', 'out' => './newspassidBidAdapter_spec.js.' . date("Y-m-d_H_i_s") . '.txt'],
];

foreach($arrConfig as $config) {
    $arr = file($config['in']);
    $outFile = $config['out'];
    file_put_contents($outFile, '');
    $writeLine = true;
    foreach($arr as $line) {
        if(strpos($line, '--- START REMOVE FOR RELEASE') !== false ) {
            $writeLine = false;
            continue;
        }
        if(strpos($line, '--- END REMOVE FOR RELEASE') !== false ) {
            $writeLine = true;
            continue;
        }

        // remove javadoc comments
        if(preg_match('~^[ \t]*/\*\*?[ \t]*$~', $line)) {
            $writeLine = false;
            continue;
        }
        if(preg_match('~^[ \t]*\*/[ \t]*$~', $line)) {
            $writeLine = true;
            continue;
        }

        if($writeLine) {
            // second level. Remove commented lines ONLY if the comments are the first things
            if(preg_match('~^\W*?//~', $line, $arr)) { continue; }
            // remove completely empty lines
            if(preg_match('/^[ \t]*$/', $line, $arr)) { continue; }

            file_put_contents($outFile, $line, FILE_APPEND);
        }
    }
}

print "\n\nFILE CONFIG : \n";
print_r($arrConfig);
