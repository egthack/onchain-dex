<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

$path = $_SERVER['REQUEST_URI'];
if ($path == '/' || $path == '') {
    $path = '/index.html';
}

$fullPath = __DIR__ . $path;

if (file_exists($fullPath)) {
    $extension = pathinfo($fullPath, PATHINFO_EXTENSION);
    
    switch ($extension) {
        case 'html':
            header('Content-Type: text/html');
            break;
        case 'css':
            header('Content-Type: text/css');
            break;
        case 'js':
            header('Content-Type: application/javascript');
            break;
    }
    
    readfile($fullPath);
} else {
    http_response_code(404);
    echo '404 Not Found';
} 