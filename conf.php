<?php
// Nota: Poner Datos de Amazon
$server = "localhost";
$user = "root";
$pass = "";
$db = "masgps";

$conn = new mysqli($server,$user,$pass,$db);

if($conn->connect_error){
    die("Error de conexion: " . $conn->connect_error);
}
?>