const formulario = document.getElementById('formulario');

const urlServer = 'https://andenes.terminal-calama.com';


const urlUpdate = urlServer + '/TerminalCalama/PHP/Boleta/save.php';
const urlStore = urlServer + '/TerminalCalama/PHP/Custodia/store.php';
const urlState = urlServer + '/TerminalCalama/PHP/Custodia/reload.php';
const urlLoad = urlServer + '/TerminalCalama/PHP/Boleta/load.php';

formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    // Obtenemos el código de barras escaneado
    const barcodeTxt = formulario.barcodeIn.value.trim();
    // Separar ID y RUT (formato esperado: idcustodia/rut)
    const barcodeData = barcodeTxt.split('/');
    if (barcodeData.length !== 2) {
        alert("Código de barras inválido. El formato debe ser: idcustodia/rut");
        return;
    }
    const idIn = barcodeData[0]; // ID de custodia
    const rutIn = barcodeData[1]; // RUT

    // Obtenemos la fecha y hora actual
    const dateAct = new Date();
    const horaStr = dateAct.getHours().toString().padStart(2, '0') + ':' +
                    dateAct.getMinutes().toString().padStart(2, '0') + ':' +
                    dateAct.getSeconds().toString().padStart(2, '0');
    const fechaStr = dateAct.toISOString().split('T')[0];

    // Llamar a la API para obtener los datos de la custodia
    traerDatos(idIn)
        .then(result => {
            if (!result || !result.fecha || !result.hora) {
                throw new Error("Este ticket ya fue procesado o inválido.");
            }

            // Verificar si el ticket ya fue marcado como entregado
            if (result.estado === "Entregado") {
                throw new Error("El ticket ya ha sido escaneado anteriormente.");
            }

            // Calcular la diferencia de tiempo entre la fecha de entrada y la fecha actual
            const dateOld = new Date(result.fecha + 'T' + result.hora);
            const diffTime = Math.abs(dateAct - dateOld); // Diferencia total en milisegundos
            const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24)); // Convertir a días completos

            // Obtener el valor del bulto según la talla usando la función de valores.js
            const valorBulto = getValorBulto(result.talla); // Obtener el valor basado en la talla
            if (valorBulto === 0) {
                throw new Error("Error: Talla no válida.");
            }

            // Cálculo del valor total
            const valorTotal = diffDays * valorBulto;

            // Mostrar datos en la tabla
            const filasHTML = `
                <tr>
                    <td>Casillero</td>
                    <td style="text-align:right">${result.posicion || 'No especificado'}</td>
                </tr>
                <tr>
                    <td>Fecha de Entrada</td>
                    <td style="text-align:right">${result.fecha} ${result.hora}</td>
                </tr>
                <tr>
                    <td>Fecha de Salida</td>
                    <td style="text-align:right">${fechaStr} ${horaStr}</td>
                </tr>
                <tr>
                    <td>Tiempo Ocupado</td>
                    <td style="text-align:right">${diffDays} Días</td>
                </tr>
                <tr>
                    <td>Valor por Día</td>
                    <td style="text-align:right">$${valorBulto}</td>
                </tr>
                <tr>
                    <td>Valor Total</td>
                    <td style="text-align:right" id="valorTotal">$${Math.round(valorTotal)}</td>
                </tr>
                <tr>
                    <td>Talla</td>
                    <td style="text-align:right">${result.talla || 'No especificado'}</td>
                </tr>
            `;
            document.getElementById('tabla-body').innerHTML = filasHTML;

            // Preparar los datos para actualizar el registro
            const datos = {
                id: idIn,
                estado: "Entregado",
                hora: horaStr,
                fecha: fechaStr,
                valor: valorTotal,
                rut: rutIn, // Incluir el RUT
            };

            // Actualizar el registro en la base de datos
            return callAPI(datos, urlUpdate).then(() => {
                console.log("Registro actualizado correctamente.");
                // Liberar el casillero llamando a cargarEstado
                const casilla = result.posicion; // Casillero asociado al ticket
                if (casilla) {
                    return cargarEstado(casilla); // Desbloquear el casillero
                }
            });
        })
        .then(() => {
            alert("El ticket ha sido escaneado exitosamente y el casillero ha sido liberado.");
            // Limpiar formulario
            formulario.reset();
        })
        .catch(err => {
            console.error(err.message);
            alert(err.message || "El ticket ya ha sido escaneado anteriormente o es inválido.");
        });
});


async function traerDatos(id) {
    let datos = await fetch(urlLoad, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(id)
        })
        .then(response => response.json())
        .then(result => {
            return result;
        })
        .catch(error => {
            console.error('Error obteniendo datos: ', error);
        });
    return datos;
}

// Función para enviar datos a la API
async function callAPI(datos, url) {
    let id = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datos)
        })
        .then(response => response.json())
        .then(result => {
            console.log('Respuesta del servidor: ', result);
            return result;
        })
        .catch(error => {
            console.error('Error al enviar la solicitud: ', error);
        });
    return id;
}

async function cargarEstado(casilla) {
    try {
        let response = await fetch(urlState);
        let data = await response.json();

        if (!data || data.length === 0) {
            console.error('No se encontró información de estado.');
            return;
        }

        // Extraer y parsear la lista de casilleros bloqueados
        let estadoLista = JSON.parse(data[0].estado || '[]');

        // Verificar si la casilla está en la lista antes de eliminarla
        const index = estadoLista.indexOf(casilla);
        if (index > -1) {
            estadoLista.splice(index, 1);
        } else {
            console.warn(`Casillero ${casilla} no estaba bloqueado.`);
        }

        // Obtener fecha y hora actual
        const dateAct = new Date();
        const horaStr = dateAct.getHours().toString().padStart(2, '0') + ':' +
                        dateAct.getMinutes().toString().padStart(2, '0') + ':' +
                        dateAct.getSeconds().toString().padStart(2, '0');
        const fechaStr = dateAct.toISOString().split('T')[0];

        // Datos actualizados para enviar a la API
        const datos = {
            estado: JSON.stringify(estadoLista),
            hora: horaStr,
            fecha: fechaStr,
        };

        // Guardar la nueva lista de casilleros bloqueados
        await callAPI(datos, urlStore);
        console.log(`Estado actualizado: Casillero ${casilla} desbloqueado.`);
        
    } catch (error) {
        console.error('Error al actualizar estado:', error);
    }
}

function printBol() {
    // Verifica que el valor total está disponible
    const valorTotal = parseFloat(document.querySelector('#valorTotal').textContent.replace('$', '').trim());

    // Si el valor total no está disponible o es NaN, se muestra un error
    if (!valorTotal || isNaN(valorTotal)) {
        console.error("El valor total no es válido para el servicio:", "Custodia");
        return;
    }

    let servicio = "Custodia"; 

    let payload = {
        "codigoEmpresa": "89",
        "tipoDocumento": "39",
        "total": valorTotal.toString(), // Pasar el valor como string
        "detalleBoleta": `53-${valorTotal}-1-dsa-${servicio}`
    };

    console.log("Payload preparado para el envío:", payload);

    $.ajax({
        url: "https://qa.pullman.cl/srv-dte-web/rest/emisionDocumentoElectronico/generarDocumento",
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(payload),
        beforeSend: function () {
            console.log("Iniciando conexión con el servidor...");
        },
        success: function (response) {
            try {
                console.log("Respuesta recibida:", response);

                if (response.respuesta === "OK") {
                    let pdfUrl = response.rutaAcepta;

                    // Abrir el PDF directamente en una nueva ventana
                    const ventanaImpr = window.open(pdfUrl, '_blank');
                    if (!ventanaImpr) {
                        alert("Por favor, habilite las ventanas emergentes para visualizar el PDF.");
                    } else {
                        console.log("PDF abierto en nueva ventana:", pdfUrl);
                    }
                } else {
                    console.error("Error al generar la boleta:", response);
                    alert("Error al generar la boleta.");
                }
            } catch (error) {
                console.error("Error al procesar la respuesta:", error);
                alert("Error inesperado. Consulte la consola para más detalles.");
            }
        },
        error: function (jqXHR, textStatus, errorThrown) {
            console.error("Error en la solicitud AJAX:", textStatus, errorThrown);
            alert("Error en la comunicación con el servidor.");
        },
        complete: function () {
            console.log("Conexión con el servidor finalizada.");
        }
    });
}

const consultarTicket = (barcodeTxt) => {
    const barcodeData = barcodeTxt.split('/');
    if (barcodeData.length !== 2) {
        alert("Código de barras inválido.");
        return;
    }
    const idIn = barcodeData[0]; // ID de custodia
    const rutIn = barcodeData[1]; // RUT

    // Obtener la fecha y hora actual
    const dateAct = new Date();
    const horaStr = dateAct.getHours().toString().padStart(2, '0') + ':' +
                    dateAct.getMinutes().toString().padStart(2, '0') + ':' +
                    dateAct.getSeconds().toString().padStart(2, '0');
    const fechaStr = dateAct.toISOString().split('T')[0];

    // Llamar a la API para obtener los datos de la custodia
    traerDatos(idIn)
        .then(result => {
            if (!result || !result.fecha || !result.hora) {
                throw new Error("El ticket ya ha sido escaneado anteriormente o es inválido.");
            }

            // Verificar si el ticket ya fue marcado como entregado
            if (result.estado === "Entregado") {
                throw new Error("El ticket ya ha sido marcado como entregado.");
            }

            // Calcular la diferencia de tiempo entre la fecha de entrada y la fecha actual
            const dateOld = new Date(result.fecha + 'T' + result.hora);
            const diffTime = Math.abs(dateAct - dateOld); // Diferencia total en milisegundos
            const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24)); // Convertir a días completos

            // Obtener el valor del bulto según la talla usando la función de valores.js
            const valorBulto = getValorBulto(result.talla);
            if (valorBulto === 0) {
                throw new Error("Error: Talla no válida.");
            }

            // Cálculo del valor total
            let valorTotal = diffDays * valorBulto;

            // Mostrar datos en la tabla
            const filasHTML = `
                <tr>
                    <td>Casillero</td>
                    <td style="text-align:right">${result.posicion || 'No especificado'}</td>
                </tr>
                <tr>
                    <td>Fecha de Entrada</td>
                    <td style="text-align:right">${result.fecha} ${result.hora}</td>
                </tr>
                <tr>
                    <td>Fecha de Salida</td>
                    <td style="text-align:right">${fechaStr} ${horaStr}</td>
                </tr>
                <tr>
                    <td>Tiempo Ocupado</td>
                    <td style="text-align:right">${diffDays} Días</td>
                </tr>
                <tr>
                    <td>Valor por Día</td>
                    <td style="text-align:right">$${valorBulto}</td>
                </tr>
                <tr>
                    <td>Valor Total</td>
                    <td style="text-align:right">$${Math.round(valorTotal)}</td>
                </tr>
                <tr>
                    <td>Talla</td>
                    <td style="text-align:right">${result.talla || 'No especificado'}</td>
                </tr>
            `;
            document.getElementById('tabla-body').innerHTML = filasHTML;
        })
        .catch(err => {
            console.error(err.message);
            alert(err.message || "Error al consultar el ticket.");
        });
};

document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("btnConsultar").addEventListener("click", function() {
        const barcodeTxt = document.getElementById("barcodeIn").value.trim();

        if (barcodeTxt === "") {
            alert("Por favor, ingrese un código de barras.");
            return;
        }

        consultarTicket(barcodeTxt);
    });
});

function printComp() {
    // Obtener los datos del DOM (tabla generada previamente)
    const casillero = document.querySelector('#tabla-body tr:nth-child(1) td:nth-child(2)').innerText;
    const fechaEntrada = document.querySelector('#tabla-body tr:nth-child(2) td:nth-child(2)').innerText;
    const fechaSalida = document.querySelector('#tabla-body tr:nth-child(3) td:nth-child(2)').innerText;
    const tiempoOcupado = document.querySelector('#tabla-body tr:nth-child(4) td:nth-child(2)').innerText;
    const valorPorDia = document.querySelector('#tabla-body tr:nth-child(5) td:nth-child(2)').innerText;
    const valorTotal = document.querySelector('#tabla-body tr:nth-child(6) td:nth-child(2)').innerText;
    const talla = document.querySelector('#tabla-body tr:nth-child(7) td:nth-child(2)').innerText;

    // Generar un número de comprobante aleatorio (opcional)
    const numeroComprobante = Math.floor(100000 + Math.random() * 900000);

    // Crear el contenido HTML del comprobante
    const comprobanteHTML = `
        <html>
        <head>
            <title>Comprobante de Entrega</title>
            <style>
                /* Estilos generales */
                body {
                    font-family: 'Roboto', Arial, sans-serif;
                    margin: 20px;
                    background-color: #f9f9f9;
                    color: #333;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: #fff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    text-align: center;
                    font-size: 28px;
                    color: rgb(16, 163, 85);
                    margin-bottom: 20px;
                }
                h2 {
                    font-size: 20px;
                    color: #555;
                    margin-bottom: 10px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 10px;
                    text-align: left;
                }
                th {
                    background-color: #f4f4f4;
                    color: #333;
                }
                .total {
                    font-weight: bold;
                    text-align: right;
                    color: rgb(16, 163, 85);
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 14px;
                    color: #777;
                }
                .logo {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .logo img {
                    max-width: 150px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <!-- Logo -->
                <div class="logo">
                    <img src="img/logo.png" alt="Logo de la Empresa">
                </div>

                <!-- Título -->
                <h1>Comprobante de Entrega</h1>
                <h2>Número de Comprobante: ${numeroComprobante}</h2>

                <!-- Tabla de Datos -->
                <table>
                    <tr>
                        <th>Casillero</th>
                        <td>${casillero}</td>
                    </tr>
                    <tr>
                        <th>Fecha de Entrada</th>
                        <td>${fechaEntrada}</td>
                    </tr>
                    <tr>
                        <th>Fecha de Salida</th>
                        <td>${fechaSalida}</td>
                    </tr>
                    <tr>
                        <th>Tiempo Ocupado</th>
                        <td>${tiempoOcupado}</td>
                    </tr>
                    <tr>
                        <th>Valor por Día</th>
                        <td>${valorPorDia}</td>
                    </tr>
                    <tr>
                        <th>Talla</th>
                        <td>${talla}</td>
                    </tr>
                    <tr>
                        <th class="total">Valor Total</th>
                        <td class="total">${valorTotal}</td>
                    </tr>
                </table>

                <!-- Pie de Página -->
                <div class="footer">
                    Gracias por utilizar nuestros servicios. Este es un comprobante válido.
                </div>
            </div>
        </body>
        </html>
    `;

    // Abrir una nueva ventana y escribir el contenido del comprobante
    const ventanaImpresion = window.open('', '_blank');
    ventanaImpresion.document.open();
    ventanaImpresion.document.write(comprobanteHTML);
    ventanaImpresion.document.close();

    // Esperar a que se cargue el contenido y luego imprimir
    ventanaImpresion.onload = function () {
        ventanaImpresion.print();
    };
}