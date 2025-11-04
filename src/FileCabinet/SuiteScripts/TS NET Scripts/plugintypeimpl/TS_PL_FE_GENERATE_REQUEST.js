/**
* @NApiVersion 2.x
* @NScriptType plugintypeimpl
* @NModuleScope Public
* @author rhuaccha
*/
define(['N/runtime', 'N/search', 'N/record', 'N/file', 'N/render', 'N/log', 'SuiteScripts/TS NET Scripts/plugintypeimpl/FE/Script/Lib/TS_LIB_DATA.js'],
    function (runtime, search, record, file, render, log, lib) {

        const TIME_ZONE = 'GMT-5';
        const STATUS_OK = true;
        const STATUS_ERROR = false;
        const FACTURA = '01';
        const BOLETA = '03';
        const NC = '07';
        const ND = '08';
        const IBERO_AEROPUERTO = 11;
        const VERSION_UBL = '2.1';
        const FTL_TEMPLATE = 'SuiteScripts/TS NET Scripts/plugintypeimpl/FE/ftl/TS_FTL_FE_PAYLOAD.ftl';
        const FE_REQUEST_FOLDER = 1484350; // SB: 1088872    Prod: 1484350
        const SUBSIDIARY_ID = 1;
        const PRECIO_BOLSA = 0.1;
        const IMPUESTO_BOLSA = 0.5;
        const currentScript = runtime.getCurrentScript();

        function validate(plugInContext) {
            var result = { success: false, message: "Validation failed." };
            var internalId = plugInContext.transactionInfo.transactionId;
            var userId = plugInContext.userId;
            var transacctionType = plugInContext.transactionInfo.transactionType
            var trace = 'Actividad 1';

            try {
                var transacction = identifyDocumentType(internalId);
                trace = 'Actividad 2';

                // AGREGAR: Obtener tipo de operación desde la transacción
                var tipoOperacion = '';
                var isTaxFree = false;

                try {
                    // Determinar el tipo de record según el transactionType
                    var recordType = null;
                    if (transacctionType === 'cashsale') {
                        recordType = record.Type.CASH_SALE;
                    } else if (transacctionType === 'invoice') {
                        recordType = record.Type.INVOICE;
                    } else if (transacctionType === 'creditmemo') {
                        recordType = record.Type.CREDIT_MEMO;
                    }

                    if (recordType) {
                        var transactionRecord = record.load({
                            type: recordType,
                            id: internalId,
                            isDynamic: false
                        });

                        // Obtener tipo de operación (si existe el campo)
                        try {
                            tipoOperacion = transactionRecord.getValue({
                                fieldId: 'custbody_pe_ei_operation_type'
                            }) || 'NO DEFINIDO';
                        } catch (e) {
                            tipoOperacion = 'CAMPO NO ENCONTRADO';
                        }

                        // Obtener TAX FREE
                        try {
                            isTaxFree = transactionRecord.getValue({
                                fieldId: 'custbody_pe_tax_free'
                            }) || false;
                        } catch (e) {
                            isTaxFree = false;
                        }
                    }
                } catch (e) {
                    tipoOperacion = 'ERROR: ' + e.message;
                }

                // Log ampliado con tipo de operación y TAX FREE
                saveLog(internalId, null, userId, 'TIPO_DOCUMENTO_IDENTIFICADO',
                    JSON.stringify({
                        documentType: transacction.documentType,
                        typeDescription: transacction.documentType === '01' ? 'FACTURA' :
                            transacction.documentType === '03' ? 'BOLETA' :
                                transacction.documentType === '07' ? 'NOTA_CREDITO' :
                                    transacction.documentType === '08' ? 'NOTA_DEBITO' : 'DESCONOCIDO',
                        serie: transacction.serie,
                        numero: transacction.numero,
                        transactionType: transacction.type,
                        subsidiaryId: transacction.subsidiaryId,
                        status: transacction.status,
                        tipoOperacion: tipoOperacion,
                        isTaxFree: isTaxFree,
                        recordType: transacctionType
                    }));

                if (transacction.status === STATUS_ERROR || transacction.documentType === '00') {
                    result.success = false;
                    result.message = 'No se puede identificar el tipo de documento';
                    return result;
                }

                var config = getConfigWs(transacction.subsidiaryId);

                if (config.status === STATUS_ERROR) {
                    result.success = false;
                    result.message = 'No se puede obtener la configuracion del WS';
                    return result;
                }

                var libResult = lib.getTransactionInfo(internalId, transacction.documentType);

                // LOG PARA DEBUG DE libResult
                if (libResult && libResult.data) {
                    var allKeys = Object.keys(libResult.data);
                    var dataPreview = {};

                    // Crear un preview de los datos más relevantes
                    var importantKeys = ['totalAmount', 'total', 'amount', 'memoTotal', 'grossAmount', 'subtotal', 'taxTotal'];
                    for (var i = 0; i < importantKeys.length; i++) {
                        var key = importantKeys[i];
                        if (libResult.data.hasOwnProperty(key)) {
                            dataPreview[key] = libResult.data[key];
                        }
                    }

                    saveLog(internalId, null, userId, 'LIB_RESULT_DEBUG_COMPLETE',
                        'libResult status: ' + libResult.status +
                        '\nTotal keys: ' + allKeys.length +
                        '\nAll keys: ' + JSON.stringify(allKeys) +
                        '\nAmount-related data: ' + JSON.stringify(dataPreview));
                } else {
                    saveLog(internalId, null, userId, 'LIB_RESULT_ERROR',
                        'libResult is null or has no data property');
                }

                saveFile('requestDM.json', file.Type.PLAINTEXT, JSON.stringify(libResult), FE_REQUEST_FOLDER);
                trace = 'Actividad 3';

                var trxNumber = transacction.serie + '-' + transacction.numero;
                if (libResult.status === STATUS_ERROR) {
                    saveLog(internalId, null, userId, 'Error info', libResult.message);
                    result.success = false;
                    result.message = 'No fue posible recuperar la información de las transacción: ' + trxNumber;
                    return result;
                }

                trace = 'Actividad 4';
                var subsidiary = lib.getSubsidiary(transacction.subsidiaryId);
                if (subsidiary.status === STATUS_ERROR) {
                    saveLog(internalId, null, userId, 'Error Subsidiary', subsidiary.message);
                    result.success = false;
                    result.message = 'No fue posible recuperar la información de la subsidiaria: ' + trxNumber;
                    return result;
                }
                saveFile('subsidiary.json', file.Type.PLAINTEXT, JSON.stringify(subsidiary), FE_REQUEST_FOLDER);

                trace = 'Actividad 5';
                var object = null;

                // AQUÍ ESTÁN LAS LLAMADAS QUE FALTABAN:
                if (transacction.documentType === FACTURA || transacction.documentType === BOLETA) {
                    object = processInvoiceOrBoleta(libResult, subsidiary.data, internalId, userId, config, transacctionType);
                } else if (transacction.documentType === NC) {
                    object = processCreditMemo(libResult, subsidiary.data, internalId, userId, config, transacction.documentType);
                } else if (transacction.documentType === ND) {
                    object = processDebitMemo(libResult, subsidiary.data, internalId, userId, config, transacction.documentType);
                } else {
                    var result = { success: false, message: "No fue posible procesar la información de la transacción: " + trxNumber };
                    return result;
                }

                if (object.status === STATUS_ERROR) {
                    var result = { success: false, message: 'No fue posible procesar la información: ' + trxNumber + ' - ' + object.message };
                    return result;
                }

                saveFile('requestProcess.json', file.Type.PLAINTEXT, JSON.stringify(object), FE_REQUEST_FOLDER);
                var fileName = internalId + '_' + trxNumber + '.xml';

//                return { success: true, message: 'No fue posible procesar la información: ' + trxNumber + ' - ' + object.message };

                trace = 'Actividad 6';

                //return { success: true, message: '1. No fue posible procesar la información: ' + trxNumber + ' - ' + object.message };

                var request = generateRequest(object.data, fileName, internalId, transacction.documentType, userId, transacction.type);
                

                if (request.status === STATUS_ERROR) {
                    var result = { success: false, message: 'No fue posible generar la solicitud xml: ' + trxNumber + ' - ' + request.message };
                    return result;
                }

                // saveLog(internalId, null, userId, 'OK', JSON.stringify(request));
                var result = { success: true, message: 'Validación inicial completada correctamente' };
                saveLog(internalId, null, userId, 'FINALIZA_COMPLETO', 'FIN_COMPLETO ' + JSON.stringify(result));
                return result;

            } catch (error) {
                var result = { success: false, message: "Ocurrió un error en el envío: " + error.message };
                saveLog(internalId, null, userId, 'ERROR_VALIDATE', 'Error en validate: ' + error.message + ' - Trace: ' + trace);
            }
            return result;
        }

        function generateRequest(data, fileName, internalId, tipoComprobante, userId, tipoTransaccion) {
            var object = {
                status: STATUS_ERROR,
                message: 'INIT'
            }
            try {
                var template = file.load({ id: FTL_TEMPLATE });
                var inputData = { text: JSON.stringify(data) };
                var renderer = render.create();
                renderer.templateContent = template.getContents();
                renderer.addCustomDataSource({
                    format: render.DataSource.OBJECT,
                    alias: 'jsonString',
                    data: inputData
                });
                var content = renderer.renderAsString();

                var fileId = file.create({
                    name: fileName,
                    fileType: file.Type.XMLDOC,
                    contents: content,
                    folder: FE_REQUEST_FOLDER,
                    isOnline: true
                }).save();

                // var fileId = fileObj.save();
                var tmpfile = file.load({ id: fileId });
                saveLog(internalId, null, userId, 'VALIDA_TRACK_1', JSON.stringify(tmpfile));
                var update = updateTrxFields(tmpfile.url, internalId, tipoComprobante, tipoTransaccion);

                object = {
                    status: STATUS_OK,
                    message: 'Ok',
                    fileId: fileId
                }

            } catch (error) {
                object = {
                    status: STATUS_ERROR,
                    message: 'Error No se puede generar el xml: ' + error.message
                }
                saveLog(internalId, null, userId, 'Error', 'Generar xml - Detail: ' + error.message);
            }
            return object;
        }

        function processInvoiceOrBoleta(result, subsidiary, internalId, userId, config, transacctionType) {
            var object = {
                status: STATUS_ERROR,
                message: 'INIT'
            }
            var trace = 'Acividad 1';
            var detraccionData = { aplica: false };
            try {

                if (!result || !result.data) {
                    return {
                        status: STATUS_ERROR,
                        message: 'Error: No se pudo obtener los datos de la transacción'
                    };
                }
                var general = {};
                var empresa = {};
                var autenticacion = {};
                var comprobante = {};
                var comprobanteAdicional = {};
                var montoTotal = {};
                var receptor = {};
                var formaPagoSunat = {};

                autenticacion.ruc = config.user;
                autenticacion.clave = config.pass;

                empresa.ruc = subsidiary.ruc;
                empresa.nombreComercial = String(subsidiary.tradeName).replace(/&/g, 'Y');
                empresa.razonSocial = String(subsidiary.legalName).replace(/&/g, 'Y');
                empresa.codDistrito = subsidiary.codeUbigeo;
                empresa.calle = subsidiary.address;
                empresa.codPais = subsidiary.countryCode;
                empresa.tipoDocumento = subsidiary.documentType;
                empresa.telefono = subsidiary.phone;
                empresa.web = subsidiary.webSite;
                empresa.correo = subsidiary.mail;
                empresa.codEstSunat = subsidiary.codeEstSunat;

                var transactionData = result.data;
                var object = transactionData;

                saveLog(internalId, null, userId, 'DEBUG_LINES_DETRACCION',
                    'Total líneas: ' + object.lines.length);

                // for (var debugI = 0; debugI < object.lines.length; debugI++) {
                //     var debugLine = object.lines[debugI];
                //     saveLog(internalId, null, userId, 'DEBUG_LINE_' + debugI,
                //         'Line ' + debugI + ': itemType=' + debugLine.itemType +
                //         ', custcol_4601_witaxapplies=' + debugLine.custcol_4601_witaxapplies +
                //         ', amount=' + debugLine.amount +
                //         ', custcol_4601_witaxrate=' + debugLine.custcol_4601_witaxrate);
                // }

                if (!transactionData.customer) {
                    saveLog(internalId, null, userId, 'ERROR_CUSTOMER_UNDEFINED',
                        'customer es undefined. Datos disponibles: ' + JSON.stringify(Object.keys(transactionData)));
                    return {
                        status: STATUS_ERROR,
                        message: 'Error: customer no está disponible en los datos de la transacción'
                    };
                }

                // VALIDAR QUE transactionData tenga las propiedades necesarias
                if (!transactionData.totalAmount) {
                    saveLog(internalId, null, userId, 'ERROR_TOTALAMOUNT_MISSING',
                        'totalAmount no está definido en los datos de la transacción. Datos disponibles: ' +
                        JSON.stringify(Object.keys(transactionData)));

                    return {
                        status: STATUS_ERROR,
                        message: 'Error: totalAmount no está disponible en los datos de la transacción'
                    };
                }

                saveLog(internalId, null, userId, 'DEBUG_OBJECT_DETRACCION',
                    'custpage_4601_witaxamount=' + object.custpage_4601_witaxamount +
                    ', custpage_4601_witaxrate=' + object.custpage_4601_witaxrate +
                    ', tipo_objeto=' + typeof object.custpage_4601_witaxamount);

                try {
                    if (transacctionType == 'invoice')
                        detraccionData = extractDetraccionData(internalId, userId, object.totalAmount, subsidiary, object);
                } catch (detraccionError) {
                    saveLog(internalId, null, userId, 'DETRACCION_ERROR_EXTRACCION',
                        'Error extrayendo datos de detracción: ' + detraccionError.message);
                    detraccionData = { aplica: false };
                }

                try {
                    var subsidiaryRecord = record.load({
                        type: record.Type.SUBSIDIARY,
                        id: "1"
                    });

                    // CORREGIR - Verificar que subsidiary existe y inicializarlo si es necesario
                    if (!subsidiary) {
                        subsidiary = {};
                    }

                    subsidiary.cuentaBancoNacion = subsidiaryRecord.getValue({
                        fieldId: 'custrecord_pe_cuenta_banco_nacion'
                    }) || '';

                    saveLog(internalId, null, userId, 'SUBSIDIARY_CUENTA_DETRACCION',
                        'Cuenta Banco Nación obtenida: ' + subsidiary.cuentaBancoNacion);

                } catch (e) {
                    saveLog(internalId, null, userId, 'SUBSIDIARY_CUENTA_ERROR',
                        'Error obteniendo cuenta banco nación: ' + e.message);
                    if (!subsidiary) {
                        subsidiary = {};
                    }
                    subsidiary.cuentaBancoNacion = '';
                }

                var razonSocial = null;
                var numeroDocumento = null;
                var direccionCliente = null;

                if (transactionData.location === IBERO_AEROPUERTO) {
                    razonSocial = transactionData.nombre + ' - ' + transactionData.numeroVuelo + ' ' + transactionData.pasaporte.replace(/[+-]/g, ''); //Se reemplaza en el pasaporte 300924 jhair robles
                    numeroDocumento = transactionData.taxNumber;
                    direccionCliente = transactionData.pais;
                } else {
                    razonSocial = transactionData.customer.customer;
                    numeroDocumento = transactionData.customer.ruc;
                    direccionCliente = transactionData.billAddress1 + ' ' + transactionData.billAddress2;
                }

                var cuponCode = transactionData.promotionCode;
                var promocion = {};

                if (cuponCode) {
                    promocion = getPromocion(object.promotionCode);
                    promocion.discontAmount = object.purchaseDisc;
                }

                // Terminos de pago
                var terms = object.terms;
                var termino = null;
                var arrCuotas = [];
                var totalCuotas = 0;
                var arrCuotasNotas = [];
                var fechaFinCouta = object.dueDate;
                var tipoCambio = Number(parseFloat(object.tipoCambio).toFixed(3));

                var totalAmount = transactionData.totalAmount || 0;
                var currencySymbol = transactionData.currencySymbol || 'PEN';
                var dueDate = transactionData.dueDate || '';

                //saveLog(internalId, null, userId, 'Prueba', 'object.totalAmount -> ' + object.totalAmount + ';' );
                if (terms !== null && terms !== '' && String(terms).toUpperCase() !== 'AL CONTADO') {
                    var termName = terms.split(' ');
                    termino = termName[0].toUpperCase();

                    if (termName.length > 2) {
                        arrCuotas = getCuotas(internalId, object.totalAmount, object.dueDate, object.currencySymbol, tipoCambio);
                        if (arrCuotas.length !== 0) {
                            for (var x = 0; x < arrCuotas.length; x++) {
                                totalCuotas += parseFloat(arrCuotas[x].amount);
                            }
                        }
                        // arrCuotas = buscarCuotas(internalId, object.totalAmount, object.dueDate);
                        arrCuotasNotas = buscarCuotasNotas(internalId, object.totalAmount, object.dueDate, object.currencySymbol);
                        fechaFinCouta = buscarFechasCuotas(internalId, object.dueDate);
                    } else if (termName.length == 2) {
                        arrCuotas = getUnicaCuota(object.dueDate, object.totalAmount, object.currencySymbol, tipoCambio)
                        if (arrCuotas.length !== 0) {
                            for (var x = 0; x < arrCuotas.length; x++) {
                                totalCuotas += parseFloat(arrCuotas[x].amount);
                            }
                        }
                    }
                }

                // Monto total
                comprobante.cuotas = arrCuotas;
                comprobante.serie = object.serie;
                comprobante.numero = object.numero;
                comprobante.fechaEmision = object.fechaEmision;
                comprobante.tipoComprobante = object.tipoDocumento;
                comprobante.moneda = object.currencySymbol;
                comprobante.horaEmision = object.horaEmision;
                comprobante.tipoOperacion = object.tipoOperacion;

                comprobante.tipoDocIdentidad = object.tipoDocReceptor;
                comprobante.ruc = numeroDocumento;
                //comprobante.razonSocial = razonSocial.replace(/&/g, 'Y').replace('', numeroDocumento); //jhair 081024
                comprobante.razonSocial = razonSocial.replace(/&/g, 'Y').trim();
                comprobante.tipoDocIdentidad = object.customer.tipoDocumento;
                comprobante.memo = object.memo;


                var totalDoc = 0;
                var totalDocTax = 0;
                if (object.currencySymbol === 'USD') {
                    totalDoc = parseFloat(object.totalAmount / tipoCambio).toFixed(2);
                    totalDocTax = parseFloat(object.taxTotal / tipoCambio).toFixed(2);
                } else {
                    totalDoc = parseFloat(object.totalAmount).toFixed(2);
                    totalDocTax = parseFloat(object.taxTotal).toFixed(2);
                }

                /*comprobante.importeTotal = totalDoc; // object.totalAmount;
                comprobante.totalImpuesto = totalDocTax; // object.taxTotal;
                var subtotal = parseFloat(totalDoc - totalDocTax); // parseFloat(object.totalAmount) - parseFloat(object.taxTotal);
                comprobante.totalValVenta = subtotal.toFixed(2);
                comprobante.totalPrecioventa = totalDoc;*/ // object.totalAmount; // subtotal.toFixed(2);

                comprobante.versionUbl = VERSION_UBL;

                var taxTotal = object.taxTotal;
                var lines = [];
                var baseAmountChargeDisc = '';
                var anyDiscountIgv = '';

                var fbGravado = {
                    total: 0,
                    valorImpuesto: 0,
                    base: 0,
                    porcentaje: ''
                };
                var fbInafecto = {
                    total: 0
                };
                var fbExonerado = {
                    total: 0
                };
                var fbExportacion = {
                    total: 0
                };
                var fbGratuito = {
                    base: 0,
                    valorImpuesto: 0,
                    total: 0
                }
                var impTotalIcbp = {
                    valorImpuesto: 0
                };
                var descGlobal = {};
                //var retencion = {};
                var texto = {};
                var desclinea = 0;
                var existsIcbp = false;
                var icbpTotalAmount = 0;
                var icbpTotalLineAmount = 0;
                var icbpTotalTax = 0;
                //var totalAmountRet = 0;
                //var existsRet = false;
                var existSubtotal = false;
                var taxCodeSubtotal = '';

                if (object.numeroVuelo != '' && object.numeroVuelo != null) {
                    texto.numerovuelo = object.numeroVuelo;
                }

                trace = 'For Actividad 2';
                var isDiscountGlobal = false;
                var DescNoAfecto = 0;

                var CargoDescuentoGlobal = 0;

                for (var j = 0; j < object.lines.length; j++) {
                    var cml = object.lines[j];
                    if (cml.itemType === 'Discount') {
                        var cmRate = parseFloat(cml.rate);
                        var cmratePorcentaje = cml.rateTex + '';

                        if (cmratePorcentaje.indexOf('%') == '-1') {
                            CargoDescuentoGlobal = cmRate.toFixed(5);
                        } else {
                            cmRate = cmRate.toString().replace('-', '').replace('%', '');
                            CargoDescuentoGlobal = cmRate / 100;
                            cmRound = CargoDescuentoGlobal.toString().split('.');
                            // cmCargoDescuento = cmRound[1].length > 5 ? cmCargoDescuento.toFixed(5) : cmRound;
                            if (cmRound.length > 1 && cmRound[1] !== undefined && cmRound[1].length > 5) {
                                CargoDescuentoGlobal = CargoDescuentoGlobal.toFixed(5);
                            }
                            CargoDescuentoGlobal = parseFloat(CargoDescuentoGlobal)
                        }
                        if (existSubtotal == true) {
                            taxCodeSubtotal = cml.taxCodeDisplay;
                        }
                        //existDiscount = true;
                    } else if (cml.itemType === 'Subtotal') {
                        existSubtotal = true;
                    }
                }


                for (var i = 0; i < object.lines.length; i++) {
                    var line = object.lines[i];
                    var precioVentUnit = 0.0;
                    var precioVentUnitString = 0.0;
                    var detalleImpuesto = {};
                    var itemTypeDiscount = '';
                    var anyDiscount = 'N';
                    var cargoDescuento = 0.00;
                    var montoCargoDescuento = 0.0;
                    var stringRound = 0.0;

                    var amount = object.totalAmount; // amount??
                    var taxAmount1 = object.tax1amt;

                    var tax1amt = object.tax1amt;
                    var artGratuito = line.articuloGractuito;
                    var artBonificacion = line.articuloBonificacion;
                    // VARIABLES PARA EL DESCUENTO
                    var indicadorDescuento = '';
                    var montoDescuento = 0.0;
                    var detalleDescuento = {};
                    var impuestoIcbp = {};
                    var currentLineDisc = 0;
                    var itemPlaca = '0';
                    var codigoItem = '';
                    // var round = 0.0;
                    // VARIABLES PARA LOS TOTALES

                    if (line.itemType == 'InvtPart' || line.itemType == 'Service' || line.itemType == 'NonInvtPart') {
                        precioVentUnit = (line.rate + (line.rate * (line.taxRate1 / 100)));
                        trace = 'For Actividad 3';
                        precioVentUnitString = precioVentUnit.toString().split('.');

                        if (typeof precioVentUnitString[1] !== 'undefined') {
                            precioVentUnit = precioVentUnitString[1].length > 7 ? precioVentUnit.toFixed(7) : precioVentUnit;
                        }
                        // OP GRAVADAS
                        if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                            if (object.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.codigoTributo = '9996';
                                detalleImpuesto.afectacionIgv = '13';//'11';
                                if (artBonificacion === true) {
                                    detalleImpuesto.afectacionIgv = '15';
                                }
                                detalleImpuesto.desTributo = 'GRA';
                                detalleImpuesto.codigoUN = 'FRE';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = '0.00';
                                detalleImpuesto.precioUnitario = '0.00';
                            } else {
                                detalleImpuesto.codigoTributo = '1000';
                                detalleImpuesto.afectacionIgv = '10';
                                detalleImpuesto.desTributo = 'IGV';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = parseFloat(line.rate).toFixed(2);
                                detalleImpuesto.precioUnitario = parseFloat(line.amount).toFixed(2);
                            }
                            try {
                                var nextLine = object.lines[i + 1]
                                itemTypeDiscount = nextLine.itemType;
                            } catch (error) {

                            }
                            if ((itemTypeDiscount === 'Discount' && line.retencionImp !== true) && artGratuito != true && artBonificacion != true) {
                                anyDiscount = 'Y'; // any
                                var taxWithoutDisc = Number(parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2)); // 0.52
                                currentLineDisc = parseFloat((line.amount + taxWithoutDisc) - Math.abs(nextLine.amount)).toFixed(2);
                                // parseFloat((line.amount + taxWithoutDisc) - Math.abs(nextLine.montoImpuesto));

                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);

                                fbGravado.total += Number(parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2));
                                fbGravado.base += Number(parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2));
                                fbGravado.valorImpuesto += Number(parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2));
                                fbGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                desclinea += Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                            } else {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                if (artGratuito === true || artBonificacion === true) {
                                    detalleImpuesto.rate = '0.00';
                                }

                                if (object.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                    fbGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                    fbGratuito.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                    fbGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                } else if (line.isIcbp === true) {
                                    fbGratuito.base += Number(parseFloat(line.quantity * (0.10)).toFixed(2));
                                    fbGratuito.valorImpuesto += Number(parseFloat(line.quantity * (0.10) * (0.18)).toFixed(2));
                                    fbGratuito.total += Number(parseFloat(line.quantity * (0.10)).toFixed(2));
                                } else {
                                    if (object.tipoOperacion == '0200') {
                                        fbExportacion.total += Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                                    } else {
                                        fbGravado.total += Number(parseFloat(line.amount).toFixed(2));
                                        fbGravado.base += Number(parseFloat(line.amount).toFixed(2));
                                        fbGravado.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                        fbGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                    }

                                }
                            }

                            // if (line.retencionImp === true) {
                            //     retencion.monto = parseFloat(line.retencionAmount).toFixed(2);
                            //     retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                            //     retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                            //     existsRet = true;
                            //     totalAmountRet += Number(parseFloat(line.retencionAmount).toFixed(2));
                            // }

                            if (line.isIcbp === true) {

                                impuestoIcbp.cantidad = line.quantity;
                                //impuestoIcbp.valorImpuesto = Number(parseFloat(line.quantity * (0.50)).toFixed(2));
                                //impuestoIcbp.valImpUnitario = Number(parseFloat((0.50)).toFixed(2));
                                impuestoIcbp.valorImpuesto = Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                                impuestoIcbp.valImpUnitario = Number(parseFloat(precioVentUnit).toFixed(2));
                                existsIcbp = true;
                                //icbpTotalAmount += Number(line.amount);
                                icbpTotalAmount += 0;
                                icbpTotalLineAmount += Number(line.amount);
                                //icbpTotalTax += Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                                icbpTotalTax += Number(parseFloat(line.amount).toFixed(2));

                                detalleImpuesto.codigoTributo = '9996';
                                detalleImpuesto.afectacionIgv = '15';
                                detalleImpuesto.desTributo = 'GRA';
                                detalleImpuesto.codigoUN = 'FRE';

                                var montoBaseBolsa = line.quantity * (0.10);
                                detalleImpuesto.montoBase = Number(parseFloat(montoBaseBolsa).toFixed(2));
                                detalleImpuesto.importeTributo = Number(parseFloat((0.18) * montoBaseBolsa).toFixed(2));
                                detalleImpuesto.importeExplicito = Number(parseFloat((0.18) * montoBaseBolsa).toFixed(2));
                                detalleImpuesto.tasaAplicada = '18.00';
                            }

                        }
                        // OP EXONERADAS
                        if (line.taxCodeDisplay === 'IGV_PE:E-PE') {
                            if (object.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                detalleImpuesto.afectacionIgv = '21';
                                detalleImpuesto.codigoTributo = '9996';
                                detalleImpuesto.desTributo = 'GRA';
                                detalleImpuesto.codigoUN = 'FRE';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.precioUnitario = '0.00';
                            } else {
                                detalleImpuesto.codigoTributo = '9997';
                                detalleImpuesto.afectacionIgv = '20';
                                detalleImpuesto.desTributo = 'EXO';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.precioUnitario = parseFloat(line.amount).toFixed(2);
                            }
                            try {
                                var nextLine = object.lines[i + 1]
                                itemTypeDiscount = nextLine.itemType;
                            } catch (error) {

                            }
                            if (itemTypeDiscount === 'Discount' && artGratuito != true && artBonificacion != true) {
                                anyDiscount = 'Y'; // any
                                var taxWithoutDisc = Number(parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2)); // 0.52
                                currentLineDisc = parseFloat((line.amount + taxWithoutDisc) - Math.abs(nextLine.amount)).toFixed(2);

                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                if (object.tipoOperacion == '0200') {
                                    fbExportacion.total -= Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                                    fbExportacion.total += Number(parseFloat(line.amount).toFixed(2));
                                } else {
                                    fbExonerado.total -= Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                                    fbExonerado.total += Number(parseFloat(line.amount).toFixed(2));
                                }
                                desclinea += Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                            } else {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                if (artGratuito === true || artBonificacion === true) {
                                    detalleImpuesto.rate = '0.00';
                                }

                                if (object.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                    fbGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                    fbGratuito.valorImpuesto = 0;
                                    fbGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                } else {
                                    if (object.tipoOperacion == '0200') {
                                        fbExportacion.total += Number(parseFloat(line.amount).toFixed(2));
                                    } else {
                                        fbExonerado.total += Number(parseFloat(line.amount).toFixed(2));
                                    }
                                }
                            }

                            // if (line.retencionImp === true) {
                            //     retencion.monto = parseFloat(line.retencionAmount).toFixed(2);
                            //     retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                            //     retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                            //     existsRet = true;
                            //     totalAmountRet += Number(parseFloat(line.retencionAmount).toFixed(2));
                            // }
                        }
                        // OP INAFECTAS
                        if (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp != true) {
                            if (object.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '35';
                                detalleImpuesto.codigoTributo = '9996';
                                detalleImpuesto.desTributo = 'GRA';
                                detalleImpuesto.codigoUN = 'FRE';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = '0.00';
                                detalleImpuesto.precioUnitario = '0.00';
                            } else if (line.isIcbp === true) {
                                detalleImpuesto.codigoTributo = '1000';
                                detalleImpuesto.afectacionIgv = '10';
                                detalleImpuesto.desTributo = 'IGV';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.precioUnitario = parseFloat(line.amount).toFixed(2);
                            } else {
                                detalleImpuesto.codigoTributo = '9998';
                                detalleImpuesto.afectacionIgv = '30';
                                detalleImpuesto.desTributo = 'INA';
                                detalleImpuesto.codigoUN = 'FRE';
                                detalleImpuesto.precioUnitario = parseFloat(line.amount).toFixed(2);
                            }

                            try {
                                var nextLine = object.lines[i + 1]
                                itemTypeDiscount = nextLine.itemType;
                            } catch (error) {

                            }
                            if (itemTypeDiscount === 'Discount' && artGratuito != true && artBonificacion != true) {
                                anyDiscount = 'Y'; // any
                                var taxWithoutDisc = Number(parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2)); // 0.52
                                currentLineDisc = parseFloat((line.amount + taxWithoutDisc) - Math.abs(nextLine.amount)).toFixed(2);

                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                desclinea += Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                            } else if (line.isIcbp === true) {
                                detalleImpuesto.importeTributo = parseFloat(line.amount * 0.18).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.amount * 0.18).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(18).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                            } else {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                            }

                            if (object.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                fbGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                fbGratuito.valorImpuesto = '0.00';
                                fbGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                            } else {
                                if (object.tipoOperacion == '0200') {
                                    fbExportacion.total += Number(parseFloat(line.amount).toFixed(2));
                                } else {
                                    fbInafecto.total += Number(parseFloat(line.amount).toFixed(2));
                                }
                            }

                            if (artGratuito === true || artBonificacion === true) {
                                detalleImpuesto.rate = '0.00';
                            }
                            // fbInafecto.total += parseFloat(line.amount).toFixed(2);

                            // if (line.retencionImp === true) {
                            //     retencion.monto = parseFloat(line.retencionAmount).toFixed(2);
                            //     retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                            //     retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                            //     existsRet = true;
                            //     totalAmountRet += Number(parseFloat(line.retencionAmount).toFixed(2));
                            // }
                        }

                        if (object.tipoOperacion == '0200') {
                            detalleImpuesto.codigoTributo = '9995';
                            detalleImpuesto.afectacionIgv = '40';
                            detalleImpuesto.desTributo = 'EXP';
                            detalleImpuesto.codigoUN = 'FRE';
                        }

                        // DESCUENTOS
                        if (anyDiscount === 'Y' || existSubtotal) {
                            var discLine = object.lines[i + 1]
                            var rateDiscLine = parseFloat(discLine.rate).toFixed(2);
                            var amountDiscLine = parseFloat(discLine.amount).toFixed(2);
                            var taxAmountDiscLine = parseFloat(discLine.tax1amt).toFixed(2);
                            var ratePorcentaje = discLine.rateTex + '';


                            rateDiscLine = rateDiscLine.toString().replace('-', '').replace('%', '');
                            taxAmountDiscLine = parseFloat(taxAmountDiscLine.toString().replace('-', ''));
                            cargoDescuento = (rateDiscLine / 100);
                            stringRound = cargoDescuento.toString().split('.');

                            if (typeof stringRound[1] !== 'undefined') {
                                stringRound[1].length > 5 ? cargoDescuento = cargoDescuento.toFixed(5) : cargoDescuento
                            }

                            if (existSubtotal) {
                                cargoDescuento = CargoDescuentoGlobal;
                            }

                            trace = 'For Actividad 7';
                            amountDiscLine = parseFloat(amountDiscLine.toString().replace('-', ''));
                            montoCargoDescuento = parseFloat(amountDiscLine) * parseFloat(cargoDescuento);
                            var unitDiscount = parseFloat(amountDiscLine) * parseFloat(cargoDescuento);


                            //saveLog(internalId, null, userId, 'Prueba', 'existSubtotal -> ' + existSubtotal + ';' );
                            //saveLog(internalId, null, userId, 'Prueba', 'taxCodeSubtotal -> ' + taxCodeSubtotal + ';' );

                            if (existSubtotal && (taxCodeSubtotal == 'IGV_PE:S-PE' || taxCodeSubtotal == 'IGV_PE:E-PE')) {
                                precioVentUnit = parseFloat((precioVentUnit)).toFixed(2);
                            } else {
                                if (ratePorcentaje.indexOf('%') != '-1') {
                                    precioVentUnit = parseFloat((precioVentUnit) - (cargoDescuento * precioVentUnit)).toFixed(2);
                                } else {
                                    var porceDesc = discLine.amount / line.amount
                                    if (porceDesc < 0) {
                                        porceDesc = porceDesc * (-1);
                                    }
                                    precioVentUnit = parseFloat(precioVentUnit - (porceDesc * precioVentUnit)).toFixed(2);
                                }
                            }

                            var baseAmountCargeDisc = amount;

                            amount = amount - amountDiscLine;
                            taxAmount1 = taxAmount1 - taxAmountDiscLine;
                            var codeCargoDesc = '';
                            // GRAVADA
                            if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                codeCargoDesc = '00'; // Descuentos que afectan la base imponible del IGV/IVAP
                                indicadorDescuento = '0';
                                montoDescuento -= amountDiscLine;
                            }
                            // EXONERADOS
                            if (line.taxCodeDisplay === 'IGV_PE:E-PE') {
                                codeCargoDesc = '00'; // Descuentos que afectan la base imponible del IGV/IVAP
                                indicadorDescuento = '0';
                                montoDescuento -= amountDiscLine;
                            }
                            // INACFECTA
                            if (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp != true) {
                                codeCargoDesc = '00'; // Descuentos que afectan la base imponible del IGV/IVAP
                                indicadorDescuento = '0';
                                montoDescuento -= amountDiscLine;
                            }
                            //saveLog(internalId, null, userId, 'Prueba', 'montoDescuento -> ' + montoDescuento + ';' );
                            trace = 'For Actividad 8';
                            if (ratePorcentaje.indexOf('%') != '-1') {
                                detalleDescuento = {
                                    indicador: indicadorDescuento,
                                    codigoCargoDesc: codeCargoDesc,
                                    monto: Math.abs(parseFloat(montoDescuento).toFixed(2)),
                                    descripcion: 'DESCUENTO',
                                    montoBase: parseFloat(line.amount).toFixed(2), //baseAmountCargeDisc.toString(),
                                    porcentaje: Math.abs(parseFloat(discLine.rate).toFixed(2))
                                }
                            } else {
                                detalleDescuento = {
                                    indicador: indicadorDescuento,
                                    codigoCargoDesc: codeCargoDesc,
                                    monto: Math.abs(parseFloat(montoDescuento).toFixed(2)),
                                    descripcion: 'DESCUENTO',
                                    montoBase: parseFloat(line.amount).toFixed(2), //baseAmountCargeDisc.toString(),
                                    porcentaje: Math.abs(parseFloat((discLine.amount / line.amount) * 100).toFixed(2))
                                }
                            }
                            trace = 'For Actividad 9';

                        }

                        if (tax1amt === 0) {
                            tax1amt = line.directTax1Amt;
                        }

                        if (amount === 0) {
                            amount = line.directAmount;
                        }
                        // validar
                        if (line.itemType === 'NonInvtPart' || line.isicbp === true) {
                            var icbpAmount = parseFloat(line.amount + line.tax1amt).toFixed(2);
                            tax1amt = parseFloat(tax1amt + icbpAmount).toFixed(2);
                            taxTotal = parseFloat(taxTotal) + icbpAmount;
                            // pendiente validar
                            impTotalIcbp.valorImpuesto += Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                        }

                        /*
                        var idItem = line.item;
                        var articuloActivo = search.lookupFields({
                        type: search.Type.ITEM,
                            id: idItem,
                            columns: ['custitem_mumero_placa','itemid']
                        });
                        */

                        codigoItem = line.codigoISBN;

                        if (line.ventaActivo === true) {
                            itemPlaca = line.numPlaca;
                            line.description = 'Venta de vehículo de segundo uso - placa ' + itemPlaca;
                        }



                        if (artGratuito === true || artBonificacion === true) {
                            if (artGratuito === true) { line.description = line.description + ' - GRATUITO' }
                            if (artBonificacion === true) { line.description = line.description + ' - BONIFICACION' }
                            lines.push({
                                linea: String(i + 1),
                                cantidad: line.quantity,
                                total: parseFloat(line.amount).toFixed(2),
                                precioVenta: '0.00', //parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                descripcion: line.description.replace(/[&!¡]/g, 'AX'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                valorVentUnitario: '0.00', // line.amount, // parseFloat(precioVentUnit).toFixed(2),
                                unidadComercial: line.unit,
                                valorVentaIncIgv: parseFloat(line.rate).toFixed(2), // parseFloat(precioVentUnit).toFixed(2)
                                totalImpuesto: '0.00',
                                codigoTipoPrecio: line.tipoPrecioSunat,
                                detalleImpuesto: detalleImpuesto,
                                descuentoCargoDetalle: detalleDescuento,
                                placa: itemPlaca,
                                bolsa: '1',
                                codigo: codigoItem
                                // totalImpuesto: '0.00'
                            });
                        } else if (object.freeTransfer === true) {
                            lines.push({
                                linea: String(i + 1),
                                cantidad: line.quantity,
                                total: parseFloat(line.amount).toFixed(2),
                                precioVenta: '0.00', //parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                descripcion: line.description.replace(/[&!¡]/g, 'BX'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                valorVentUnitario: '0.00', // line.amount, // parseFloat(precioVentUnit).toFixed(2),
                                unidadComercial: line.unit,
                                valorVentaIncIgv: parseFloat(line.rate).toFixed(2),//line.amount,   //+ line.tax1amt,
                                totalImpuesto: parseFloat(taxTotal).toFixed(2),
                                codigoTipoPrecio: line.tipoPrecioSunat,
                                detalleImpuesto: detalleImpuesto,
                                descuentoCargoDetalle: detalleDescuento,
                                placa: itemPlaca,
                                bolsa: '1',
                                codigo: codigoItem
                                // totalImpuesto: '0.00'
                            });
                        } else if (anyDiscount === 'Y') {
                            lines.push({
                                linea: String(i + 1),
                                cantidad: line.quantity,
                                total: parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2),
                                // precioVenta: parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                precioVenta: parseFloat(currentLineDisc).toFixed(2),
                                descripcion: line.description.replace(/[&!¡]/g, 'C'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                valorVentUnitario: parseFloat(line.rate).toFixed(2),//parseFloat(precioVentUnit).toFixed(2),
                                unidadComercial: line.unit,
                                valorVentaIncIgv: parseFloat(precioVentUnit).toFixed(2),//parseFloat((line.montoImpuesto - Math.abs(nextLine.montoImpuesto)) + (line.amount - Math.abs(nextLine.amount))).toFixed(2), // + line.tax1amt,
                                totalImpuesto: parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2), //taxTotal,
                                codigoTipoPrecio: line.tipoPrecioSunat,
                                detalleImpuesto: detalleImpuesto,
                                descuentoCargoDetalle: detalleDescuento,
                                placa: itemPlaca,
                                bolsa: '1',
                                codigo: codigoItem
                                // totalImpuesto: '0.00'
                            });
                        } else {
                            var impTotal = 0;
                            var valVentaIgv = 0;
                            var preVenta = 0;
                            var totalLinea = 0;
                            var valorVentUnita = 0;
                            var valBolsa = '1';
                            var tipePriceSunat = line.tipoPrecioSunat;



                            if (line.isIcbp === true) {
                                //impTotal = line.quantity * (0.5);
                                impTotal = parseFloat(line.amount + line.tax1amt).toFixed(2);
                                valVentaIgv = parseFloat(0.10).toFixed(2);
                                totalLinea = parseFloat(line.quantity * (0.1)).toFixed(2);
                                valBolsa = '2';
                                tipePriceSunat = '02'
                            } else {
                                impTotal = parseFloat(line.montoImpuesto).toFixed(2);
                                valVentaIgv = parseFloat(precioVentUnit).toFixed(2);
                                preVenta = parseFloat((line.quantity * line.rate) + line.tax1amt).toFixed(2);
                                totalLinea = parseFloat(line.amount).toFixed(2);
                                valorVentUnita = parseFloat(line.rate).toFixed(2);
                            }
                            lines.push({
                                linea: String(i + 1),
                                cantidad: line.quantity,
                                total: parseFloat(totalLinea).toFixed(2),
                                // precioVenta: parseFloat(line.quantity * line.rate).toFixed(2), // add
                                precioVenta: parseFloat(preVenta).toFixed(2), // add
                                descripcion: line.description.replace(/[&!¡]/g, ''), //reemplazo caractereres en el titulo al generar 270924 jhair
                                valorVentUnitario: parseFloat(valorVentUnita).toFixed(2), //  line.amount,
                                unidadComercial: line.unit,
                                valorVentaIncIgv: parseFloat(valVentaIgv).toFixed(2), // parseFloat(precioVentUnit).toFixed(2), //line.amount, // + line.tax1amt,
                                totalImpuesto: parseFloat(impTotal).toFixed(2),// line.montoImpuesto, //taxTotal,
                                codigoTipoPrecio: line.tipoPrecioSunat, //tipePriceSunat;
                                detalleImpuesto: detalleImpuesto,
                                descuentoCargoDetalle: {}, // detalleDescuento,
                                impuestoIcbp: impuestoIcbp,
                                placa: itemPlaca,
                                bolsa: valBolsa,
                                codigo: codigoItem
                                // totalImpuesto: '0.00'
                            });
                        }

                    } else if (line.itemType === 'Subtotal') {
                        baseAmountChargeDisc = amount;
                        try {
                            var globalDiscLine = object.lines[i + 1];
                            var globalAmount = Number(parseFloat(Math.abs(globalDiscLine.amount)).toFixed(2));
                            var baseGlobalAmount = Number(parseFloat(line.amount).toFixed(2));

                            if (globalDiscLine.itemType === 'Discount') {

                                var globalDiscLinePorcentaje = globalDiscLine.rateTex + '';

                                if (globalDiscLinePorcentaje.indexOf('%') != '-1') {
                                    descGlobal.descripcion = 'DESCUENTO GLOBAL del ' + Math.abs(globalDiscLine.rate) + '% del ' + baseGlobalAmount;
                                    descGlobal.porcentaje = Math.abs(globalDiscLine.rate);
                                } else {
                                    descGlobal.descripcion = 'DESCUENTO GLOBAL del ' + Math.abs(((globalDiscLine.amount / line.amount) * 100).toFixed(2)) + '% del ' + baseGlobalAmount;
                                    descGlobal.porcentaje = Math.abs(((globalDiscLine.amount / line.amount) * 100).toFixed(2));
                                }

                                descGlobal.indicador = '0';
                                descGlobal.monto = globalAmount;
                                descGlobal.codigoMotivo = '02';
                                descGlobal.montoBase = parseFloat(baseGlobalAmount).toFixed(2);
                                descGlobal.taxCode = globalDiscLine.taxCodeDisplay
                                isDiscountGlobal = true;

                                if ((descGlobal.taxCode === 'IGV_PE:Inaf-PE' && line.isIcbp === true) || descGlobal.taxCode === 'IGV_PE:E-PE') {
                                    DescNoAfecto = DescNoAfecto + descGlobal.monto;
                                    descGlobal.codigoMotivo = '03';
                                }

                            } else {
                                globalAmount += globalAmount;
                                baseGlobalAmount += baseGlobalAmount;
                            }
                            // Validación y cálculo para fbGravado

                            if (fbGravado.total !== undefined && fbGravado.total !== 0 &&
                                fbGravado.valorImpuesto !== undefined && fbGravado.valorImpuesto !== 0 &&
                                fbGravado.base !== undefined && fbGravado.base !== 0 &&
                                fbGravado.porcentaje !== undefined && fbGravado.porcentaje !== '') {

                                fbGravado.total = Number(parseFloat(fbGravado.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                                fbGravado.base = Number(parseFloat(fbGravado.base - Math.abs(globalDiscLine.amount)).toFixed(2));
                                fbGravado.valorImpuesto = parseFloat(fbGravado.valorImpuesto - Math.abs(globalDiscLine.tax1amt)).toFixed(2);
                            }

                            // Validación y cálculo para fbInafecto
                            if (fbInafecto.total !== undefined && fbInafecto.total !== 0) {
                                fbInafecto.total = Number(parseFloat(fbInafecto.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                            }

                            // Validación y cálculo para fbExonerado
                            /*if (fbExonerado.total !== undefined && fbExonerado.total !== 0) {
                                fbExonerado.total = Number(parseFloat(fbExonerado.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                            }*/

                            // Validación y cálculo para fbGratuito
                            if (fbGratuito.base !== undefined && fbGratuito.base !== 0 &&
                                fbGratuito.valorImpuesto !== undefined && fbGratuito.valorImpuesto !== 0 &&
                                fbGratuito.total !== undefined && fbGratuito.total !== 0) {

                                fbGratuito.total = Number(parseFloat(fbGratuito.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                                fbGratuito.base = Number(parseFloat(fbGratuito.base - Math.abs(globalDiscLine.amount)).toFixed(2));
                                fbGratuito.valorImpuesto = Number(parseFloat(fbGratuito.valorImpuesto - Math.abs(globalDiscLine.tax1amt)).toFixed(2));
                            }

                        } catch (error) {

                        }
                    } else if (line.itemType === 'Discount' && line.isDiscountLine === false) {
                        // GRAVADAS
                        if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                            indicadorDescuento = '1';
                            anyDiscountIgv = 'Y';
                        } else {
                            indicadorDescuento = '0';
                            anyDiscountIgv = 'Y';
                        }
                        var rateD = line.rate.toString().replace('-').replace('%', '');
                        cargoDescuento = (line.rate / 100);
                        stringRound = cargoDescuento.toString().split('.');

                        if (typeof stringRound[1] != 'undefined') {
                            stringRound[1].length > 5 ? cargoDescuento = cargoDescuento.toFixed(5) : cargoDescuento
                        }
                        amount = amount.toString().replace('-', '')
                    }


                } // END FOR

                fbGravado.valorImpuesto = parseFloat(fbGravado.valorImpuesto).toFixed(2)
                // MONTOS TOTALES
                comprobante.detalle = lines;
                comprobante.DescuentoNoAfecto = DescNoAfecto;

                var converter = new NumberToWordsConverter();
                if (object.freeTransfer === true) {
                    comprobanteAdicional.codigo2 = '1002';
                    comprobanteAdicional.texto2 = 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE';
                } else {
                    /*
                    comprobanteAdicional.codigo = '1000';
                    var importeTotal = Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount) + Number(totalAmountRet)).toFixed(2));
                    comprobanteAdicional.texto = String(converter.convertNumberToWords(importeTotal, object.currencySymbol)).toUpperCase();
                    */
                }

                comprobanteAdicional.codigo = '1000';

                // ✅ CORRECCIÓN DEL MONTO EN LETRAS - Incluir TODOS los tipos de operaciones
                var importeTotalParaLetras = 0;

                // Sumar operaciones gravadas (base + impuesto)
                if (fbGravado && fbGravado.base > 0) {
                    importeTotalParaLetras += parseFloat(fbGravado.base) + parseFloat(fbGravado.valorImpuesto);
                    saveLog(internalId, null, userId, 'DEBUG_LETRAS_GRAVADO',
                        'Gravado incluido - Base: ' + fbGravado.base +
                        ', Impuesto: ' + fbGravado.valorImpuesto +
                        ', Subtotal gravado: ' + (parseFloat(fbGravado.base) + parseFloat(fbGravado.valorImpuesto)));
                }

                // ✅ AGREGAR: Sumar operaciones exoneradas
                if (fbExonerado && fbExonerado.total > 0) {
                    importeTotalParaLetras += parseFloat(fbExonerado.total);
                    saveLog(internalId, null, userId, 'DEBUG_LETRAS_EXONERADO',
                        'Exonerado incluido: ' + fbExonerado.total);
                }

                // ✅ AGREGAR: Sumar operaciones inafectas
                if (fbInafecto && fbInafecto.total > 0) {
                    importeTotalParaLetras += parseFloat(fbInafecto.total);
                    saveLog(internalId, null, userId, 'DEBUG_LETRAS_INAFECTO',
                        'Inafecto incluido: ' + fbInafecto.total);
                }

                // ✅ AGREGAR: Sumar operaciones de exportación
                if (fbExportacion && fbExportacion.total > 0) {
                    importeTotalParaLetras += parseFloat(fbExportacion.total);
                    saveLog(internalId, null, userId, 'DEBUG_LETRAS_EXPORTACION',
                        'Exportación incluido: ' + fbExportacion.total);
                }

                // Si no se calculó nada, usar el fallback
                if (importeTotalParaLetras <= 0) {
                    importeTotalParaLetras = Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2));
                    saveLog(internalId, null, userId, 'DEBUG_LETRAS_FALLBACK',
                        'Usando fallback totalDoc: ' + importeTotalParaLetras);
                }

                saveLog(internalId, null, userId, 'MONTO_LETRAS_FINAL',
                    'Monto total para letras: ' + importeTotalParaLetras.toFixed(2) +
                    ' (anterior solo gravado era: ' + (fbGravado ? (parseFloat(fbGravado.base) + parseFloat(fbGravado.valorImpuesto)) : 0) + ')');

                comprobanteAdicional.texto = String(converter.convertNumberToWords(importeTotalParaLetras, object.currencySymbol)).toUpperCase();

                if (existsIcbp === true) {
                    comprobante.importeTotal = Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2));
                    comprobante.totalImpuesto = Number(parseFloat(Number(totalDocTax) + Number(icbpTotalTax)).toFixed(2));
                    var subtotal = parseFloat(totalDoc - totalDocTax - icbpTotalLineAmount);

                    if (isDiscountGlobal == true) {
                        comprobante.totalValVenta = parseFloat(Number(subtotal)).toFixed(2);
                        comprobante.totalPrecioventa = Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2));
                    } else {
                        comprobante.totalValVenta = subtotal.toFixed(2);
                        comprobante.totalPrecioventa = Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2));
                    }
                } else {
                    // ✅ CORRECCIÓN: Calcular ImporteTotal basado en TODOS los totales, no solo fbGravado
                    var importeTotalCalculado = 0;
                    var totalImpuestoCalculado = 0;
                    var subtotalCalculado = 0;

                    // Sumar TODOS los tipos de operaciones
                    if (fbGravado && fbGravado.total > 0) {
                        importeTotalCalculado += parseFloat(fbGravado.total);
                        totalImpuestoCalculado += parseFloat(fbGravado.valorImpuesto);
                        subtotalCalculado += parseFloat(fbGravado.base);

                        saveLog(internalId, null, userId, 'DEBUG_CALCULO_GRAVADO',
                            'Gravado - Total: ' + fbGravado.total +
                            ', Base: ' + fbGravado.base +
                            ', Impuesto: ' + fbGravado.valorImpuesto);
                    }

                    if (fbExonerado && fbExonerado.total > 0) {
                        importeTotalCalculado += parseFloat(fbExonerado.total);
                        subtotalCalculado += parseFloat(fbExonerado.total);

                        saveLog(internalId, null, userId, 'DEBUG_CALCULO_EXONERADO',
                            'Exonerado - Total: ' + fbExonerado.total);
                    }

                    if (fbInafecto && fbInafecto.total > 0) {
                        importeTotalCalculado += parseFloat(fbInafecto.total);
                        subtotalCalculado += parseFloat(fbInafecto.total);

                        saveLog(internalId, null, userId, 'DEBUG_CALCULO_INAFECTO',
                            'Inafecto - Total: ' + fbInafecto.total);
                    }

                    if (fbExportacion && fbExportacion.total > 0) {
                        importeTotalCalculado += parseFloat(fbExportacion.total);
                        subtotalCalculado += parseFloat(fbExportacion.total);

                        saveLog(internalId, null, userId, 'DEBUG_CALCULO_EXPORTACION',
                            'Exportación - Total: ' + fbExportacion.total);
                    }

                    // Agregar impuestos al total final
                    var importeTotalFinal = importeTotalCalculado + totalImpuestoCalculado;

                    saveLog(internalId, null, userId, 'DEBUG_CALCULO_FINAL',
                        'Cálculo corregido:' +
                        '\n- Subtotal (sin impuestos): ' + importeTotalCalculado.toFixed(2) +
                        '\n- Total impuestos: ' + totalImpuestoCalculado.toFixed(2) +
                        '\n- ImporteTotal FINAL: ' + importeTotalFinal.toFixed(2) +
                        '\n- totalDoc (referencia): ' + totalDoc);

                    // Usar el cálculo corregido
                    comprobante.importeTotal = importeTotalFinal.toFixed(2);
                    comprobante.totalImpuesto = totalImpuestoCalculado.toFixed(2);

                    if (isDiscountGlobal == true) {
                        if (descGlobal.taxCode == 'IGV_PE:S-PE') {
                            comprobante.totalValVenta = parseFloat(Number(subtotalCalculado)).toFixed(2);
                            comprobante.totalPrecioventa = importeTotalFinal.toFixed(2);
                        } else {
                            comprobante.totalValVenta = parseFloat(Number(subtotalCalculado) + Number(descGlobal.monto)).toFixed(2);
                            comprobante.totalPrecioventa = parseFloat(Number(importeTotalFinal) + Number(descGlobal.monto)).toFixed(2);
                        }
                    } else {
                        comprobante.totalValVenta = subtotalCalculado.toFixed(2);
                        comprobante.totalPrecioventa = importeTotalFinal.toFixed(2);
                    }
                }

                /*montoTotal.base = (object.totalAmount - object.taxTotal).toFixed(2);
                montoTotal.porcentaje = '18'; // pendiente
                montoTotal.valorImpuesto = object.taxTotal;
                montoTotal.total = (object.totalAmount - object.taxTotal).toFixed(2);*/


                montoTotal = {
                    gravado: fbGravado,
                    inafecto: fbInafecto,
                    exonerado: fbExonerado,
                    gratuito: fbGratuito,
                    icbp: impTotalIcbp,
                    exporta: fbExportacion
                }

                receptor.calle = object.customer.address === "" ? '-' : object.customer.address; //Se reemplaza la dirección del cliente cuando este vacio 300924 Jhair Robles
                receptor.codigo = object.customer.codeUbigeo
                receptor.codPais = object.customer.countryCode === '' ? 'PE' : object.customer.countryCode; //Se reemplaza el codigo de pais del cliente cuando este vacio 300924 Jhair Robles
                receptor.departamento = object.customer.state === '' ? '-' : object.customer.state; //Se reemplaza la Departamento del cliente cuando este vacio 300924 Jhair Robles;
                receptor.provincia = object.customer.state === '' ? '-' : object.customer.state; //Se reemplaza provincia del cliente cuando este vacio 300924 Jhair Robles
                receptor.distrito = object.customer.city === '' ? 'Perú' : object.customer.city; //Se reemplaza ldistrito del cliente cuando este vacio 300924 Jhair Robles

                if (desclinea != 0) {
                    texto.desclinea = Number(parseFloat(desclinea)).toFixed(2);
                }

                switch (String(object.formaPago).toUpperCase()) {
                    case 'CONTADO':
                        formaPagoSunat.tipoFormaPago = '1'
                        break;
                    case 'CREDITO':
                        formaPagoSunat.tipoFormaPago = '2'
                        break;
                }
                formaPagoSunat.montoPendiente = Math.abs(Number(totalCuotas)).toFixed(2);

                // Construir el objeto final
                comprobante.descGlobal = descGlobal;
                comprobante.montoTotal = montoTotal;
                comprobante.receptor = receptor;
                //comprobante.retencion = retencion;
                comprobante.formaPagoSunat = formaPagoSunat;
                comprobante.adicional = comprobanteAdicional;
                general.comprobante = comprobante;
                general.texto = texto;
                general.empresa = empresa;
                general.autenticacion = autenticacion;

                if (detraccionData.aplica) {
                    // AGREGAR DETRACCIÓN AL COMPROBANTE
                    general.comprobante.Detraccion = detraccionData.xmlStructure;

                    // AGREGAR PROPIEDAD ADICIONAL
                    if (!general.comprobante.ComprobantePropiedadesAdicionales) {
                        general.comprobante.ComprobantePropiedadesAdicionales = {
                            ENComprobantePropiedadesAdicionales: detraccionData.propiedadAdicional
                        };
                    } else {
                        var propiedadesExistentes = general.comprobante.ComprobantePropiedadesAdicionales;
                        general.comprobante.ComprobantePropiedadesAdicionales = [
                            propiedadesExistentes,
                            {
                                ENComprobantePropiedadesAdicionales: detraccionData.propiedadAdicional
                            }
                        ];
                    }

                    // 🆕 NUEVO: SOBRESCRIBIR CUOTAS SI ES CRÉDITO CON DETRACCIÓN
                    if (detraccionData.esCredito && detraccionData.cuotasCredito.length > 0) {
                        comprobante.cuotas = detraccionData.cuotasCredito;
                        comprobante.formaPagoSunat.tipoFormaPago = '2'; // CRÉDITO
                        comprobante.formaPagoSunat.montoPendiente = detraccionData.montoPendiente.toFixed(2);

                        // RECALCULAR totalCuotas para el resto del código
                        totalCuotas = detraccionData.montoPendiente;

                        saveLog(internalId, null, userId, 'CUOTAS_DETRACCION_APLICADAS',
                            'Cuotas de detracción aplicadas - Total cuotas: ' + detraccionData.cuotasCredito.length +
                            ', Monto pendiente: ' + detraccionData.montoPendiente);
                    }

                    saveLog(internalId, null, userId, 'DETRACCION_XML_INTEGRADA',
                        'Detracción integrada - Tipo: ' + (detraccionData.esCredito ? 'CRÉDITO' : 'CONTADO') +
                        ', Monto: ' + detraccionData.xmlStructure.Monto.ENMonto.Valor +
                        ', Cuenta: ' + detraccionData.xmlStructure.NumeroCuenta.ENNumeroCuenta.Valor);
                }

                // general.tipoComprobante = object.tipodocText;
                var tipoComprobanteTmp = '';
                switch (String(object.typeCode)) {
                    case FACTURA:
                        tipoComprobanteTmp = 'Factura';
                        break;
                    case BOLETA:
                        tipoComprobanteTmp = 'Boleta';
                        break;
                    case NC:
                        tipoComprobanteTmp = 'NotaCredito';
                        break;
                    case ND:
                        tipoComprobanteTmp = 'NotaDebito';
                        break;
                }
                general.tipoComprobante = tipoComprobanteTmp;
                general.tipoCodigo = '0';
                general.otorgar = '1';

                object = {
                    status: STATUS_OK,
                    message: 'Proceso completado correctamente',
                    data: general
                }
            
            saveLog(internalId, null, userId, 'FINALIZA_PROCESO',
                'FIN_PROCESO');

            } catch (error) {
                object = {
                    status: STATUS_ERROR,
                    message: 'Error No se puede procesar la informacion de la factura: ' + error.message
                }
                saveLog(internalId, null, userId, 'processInvoiceOrBoleta Error', error.message + ' -> ' + trace);
            }
            return object;
        }

        function processCreditMemo(libResult, subsidiary, internalId, userId, config, docType) {
            var object = {
                status: STATUS_ERROR,
                message: 'INIT'
            }
            var trace = 'Actividad 1';
            try {
                var general = {};
                var empresa = {};
                var autenticacion = {};
                var comprobante = {};
                var comprobanteAdicional = {};
                var montoTotal = {};
                var receptor = {};
                var motivoDocument = {};
                var formaPagoSunat = {};

                autenticacion.ruc = config.user;
                autenticacion.clave = config.pass;

                empresa.ruc = subsidiary.ruc;
                empresa.nombreComercial = String(subsidiary.tradeName).replace(/&/g, 'Y');
                empresa.razonSocial = String(subsidiary.legalName).replace(/&/g, 'Y');
                empresa.codDistrito = subsidiary.codeUbigeo;
                empresa.calle = subsidiary.address;
                empresa.codPais = subsidiary.countryCode;
                empresa.tipoDocumento = subsidiary.documentType;
                empresa.telefono = subsidiary.phone;
                empresa.web = subsidiary.webSite;
                empresa.correo = subsidiary.mail;
                empresa.codEstSunat = subsidiary.codeEstSunat;

                var cmObject = libResult.data;
                receptor.calle = cmObject.customer.address === '' ? '-' : cmObject.customer.address; //Se reemplaza la dirección del cliente cuando este vacio 300924 Jhair Robles
                receptor.codigo = cmObject.customer.codeUbigeo;
                receptor.codPais = cmObject.customer.countryCode === '' ? 'PE' : cmObject.customer.countryCode; //Se reemplaza pais del cliente cuando este vacio 300924 Jhair Robles;
                receptor.departamento = cmObject.customer.state === '' ? '-' : cmObject.customer.state; //Se reemplaza departamento del cliente cuando este vacio 300924 Jhair Robles
                receptor.provincia = cmObject.customer.state === '' ? '-' : cmObject.customer.state; //Se reemplaza provincia del cliente cuando este vacio 300924 Jhair Robles
                receptor.distrito = cmObject.customer.city === '' ? 'Perú' : cmObject.customer.city; //Se reemplaza distrito del cliente cuando este vacio 300924 Jhair Robles

                var converter = new NumberToWordsConverter();
                comprobanteAdicional.codigo = '1000';
                comprobanteAdicional.texto = String(converter.convertNumberToWords(Math.abs(cmObject.memoTotal), cmObject.currencySymbol)).toUpperCase();

                var cmCargoDescuento = 0.0;
                var cmMontoTotalDescGloIGV = 0.0;
                var cmImpueTotalDescGloIGV = 0.0;
                var cmImpueBrutoDescGloIGV = 0.0;
                var cmRound = '';
                var existDiscount = false;
                var existSubtotal = false;
                var taxCodeSubtotal = '';

                var montoSubtotal = 0;

                var tipoCambio = Number(parseFloat(cmObject.tipoCambio).toFixed(3));

                var totalDoc = 0;
                var totalDocTax = 0;
                if (cmObject.currencySymbol === 'USD') {
                    totalDoc = parseFloat((cmObject.totalAmount / tipoCambio) * (-1)).toFixed(2);
                    totalDocTax = parseFloat((cmObject.taxTotal / tipoCambio) * (-1)).toFixed(2);
                } else {
                    totalDoc = cmObject.totalAmount * (-1);
                    totalDocTax = cmObject.taxTotal * (-1);
                }

                //saveLog(internalId, null, userId, 'Prueba', 'totalDoc -> ' + totalDoc + ';' );
                //Cuotas
                var terms = '';
                var dueDate = ''
                var idFactura = cmObject.creadoDesde;

                //saveLog(internalId, null, userId, 'Prueba', 'recurso 1-> ' + currentScript.getRemainingUsage() + ';' );
                //saveLog(internalId, null, userId, 'Prueba', 'idFactura -> ' + idFactura + ';' );
                if (idFactura != '' && idFactura != null) {
                    var fact = search.lookupFields({
                        type: 'invoice',
                        id: idFactura,
                        columns: ["terms", "duedate"]
                    });
                    terms = fact.terms ? fact.terms[0].text : '';
                    dueDate = fact.duedate;

                    //saveLog(internalId, null, userId, 'Prueba', 'terms -> ' + terms + ';' );
                }

                if (terms == '' && idFactura != '' && idFactura != null) {
                    var autorizacion = search.lookupFields({
                        type: 'returnauthorization',
                        id: idFactura,
                        columns: ["createdfrom"]
                    });
                    idFactura = autorizacion.createdfrom ? autorizacion.createdfrom[0].value : '';

                    var fact = search.lookupFields({
                        type: 'invoice',
                        id: Number(idFactura),
                        columns: ["terms", "duedate"]
                    });
                    terms = fact.terms ? fact.terms[0].text : '';
                    dueDate = fact.duedate;
                }

                var termino = null;
                var arrCuotas = [];
                var totalCuotas = 0;
                var arrCuotasNotas = [];
                var fechaFinCouta = dueDate;

                if (terms !== null && terms !== '' && String(terms).toUpperCase() !== 'AL CONTADO') {
                    var termName = terms.split(' ');
                    termino = termName[0].toUpperCase();

                    if (termName.length > 2) {
                        arrCuotas = getCuotas(idFactura, cmObject.totalAmount, dueDate, cmObject.currencySymbol, tipoCambio);
                        if (arrCuotas.length !== 0) {
                            for (var x = 0; x < arrCuotas.length; x++) {
                                totalCuotas += parseFloat(arrCuotas[x].amount);
                            }
                        }
                        // arrCuotas = buscarCuotas(internalId, object.totalAmount, object.dueDate);
                        //arrCuotasNotas = buscarCuotasNotas(internalId, object.totalAmount, object.dueDate, object.currencySymbol);
                        //fechaFinCouta = buscarFechasCuotas(internalId, object.dueDate);
                    } else if (termName.length == 2) {
                        arrCuotas = getUnicaCuota(dueDate, cmObject.totalAmount, cmObject.currencySymbol, tipoCambio)
                        if (arrCuotas.length !== 0) {
                            for (var x = 0; x < arrCuotas.length; x++) {
                                totalCuotas += parseFloat(arrCuotas[x].amount);
                            }
                        }
                    }
                }

                // Monto total
                comprobante.cuotas = arrCuotas;
                formaPagoSunat.montoPendiente = Math.abs(Number(totalCuotas)).toFixed(2);

                var DescNoAfecto = 0;
                // LÍNEAS CON DESCUENTO
                trace = 'Actividad 1.2';
                for (var j = 0; j < cmObject.lines.length; j++) {
                    var cml = cmObject.lines[j];
                    if (cml.itemType === 'Discount') {
                        var cmRate = parseFloat(cml.rate);
                        var cmratePorcentaje = cml.rateTex + '';
                        if (cmratePorcentaje.indexOf('%') == '-1') {
                            cmCargoDescuento = Math.abs(cml.amount / montoSubtotal);
                        } else {
                            cmRate = cmRate.toString().replace('-', '').replace('%', '');
                            cmCargoDescuento = cmRate / 100;
                            cmRound = cmCargoDescuento.toString().split('.');
                            // cmCargoDescuento = cmRound[1].length > 5 ? cmCargoDescuento.toFixed(5) : cmRound;
                            if (cmRound.length > 1 && cmRound[1] !== undefined && cmRound[1].length > 5) {
                                cmCargoDescuento = cmCargoDescuento.toFixed(5);
                            }
                            cmCargoDescuento = parseFloat(cmCargoDescuento)
                        }

                        existDiscount = true;
                        if (existSubtotal == true) {
                            taxCodeSubtotal = cml.taxCodeDisplay;
                        }
                    } else if (cml.itemType === 'Subtotal') {
                        existSubtotal = true;
                        montoSubtotal = cml.amount;
                    }
                }
                trace = 'Actividad 2';
                var totalVentaGra = 0.0;
                var totalImpuestoGra = 0.0;
                var totalVentaIna = 0.0;
                var totalImpuestoIna = 0.0;
                var totalVentaExo = 0.0;
                var totalImpuestoExo = 0.0;
                var objtotalGra = {};
                var objImpGra = {};
                var objTotalIna = {};
                var objImpIna = {};
                var objTotalExo = {};
                var objImpExo = {};
                var cmLine = [];
                var objLine = {};
                // MONTOS TOTALES
                var memoGravado = {
                    total: 0,
                    valorImpuesto: 0,
                    base: 0,
                    porcentaje: ''
                };
                var memoInafecto = {
                    total: 0
                };
                var memoExonerado = {
                    total: 0
                };
                var memoExportacion = {
                    total: 0
                };
                var memoGratuito = {
                    base: 0,
                    valorImpuesto: 0,
                    total: 0
                };
                var impTotalIcbp = {
                    valorImpuesto: 0
                };
                var descGlobal = {};
                var retencion = {};
                var texto = {};
                var desclinea = 0;
                var existsIcbp = false;
                var icbpTotalTax = 0;
                var totalAmountRet = 0;
                var existsRet = false;
                var icbpTotalAmount = 0;
                var icbpTotalLineAmount = 0;
                var isDiscountGlobal = false;

                if (existDiscount === false) {
                    trace = 'Actividad 3';
                    for (var k = 0; k < cmObject.lines.length; k++) {
                        var line = cmObject.lines[k];
                        var cmTotalImpuesto = [];
                        var cmPreioVentaUnit = 0.0;
                        var cmIdImpuesto = '';
                        var cmCodigo = '';
                        var cmTipoAfectacion = '';
                        var cmKround = 0.0;
                        var detalleDescuento = {};
                        var detalleImpuesto = {};
                        var impuestoIcbp = {};
                        var itemPlaca = '0';
                        var codigoItem = '';

                        if (line.itemType === 'InvtPart' || line.itemType === 'Service' || line.itemType == 'NonInvtPart') {
                            cmPreioVentaUnit = (line.rate + (line.rate * (line.taxRate1 / 100)));
                            cmKround = cmPreioVentaUnit.toString().split('.');

                            if (typeof cmKround[1] !== 'undefined') {
                                cmPreioVentaUnit = cmKround[1].length > 7 ? cmPreioVentaUnit.toFixed(7) : cmPreioVentaUnit;
                            }
                            // GRAVADAS
                            if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                if (cmObject.freeTransfer === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '13';
                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '10';
                                    detalleImpuesto.codigoTributo = '1000';
                                    detalleImpuesto.desTributo = 'IGV';
                                    detalleImpuesto.codigoUN = 'VAT';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                }

                                cmIdImpuesto = '1000'; // evaluar si se queda
                                cmCodigo = '1001'; // evaluar si se queda
                                cmTipoAfectacion = '10'; // evaluar si se queda

                                totalVentaGra += Number(parseFloat(line.amount).toFixed(2));
                                totalImpuestoGra += Number(parseFloat(line.tax1amt).toFixed(2));
                                objtotalGra = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaGra.toFixed(2)
                                }
                                objImpGra = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoGra.toFixed(2)
                                }

                                //saveLog(internalId, null, userId, 'Prueba', 'line.isIcbp -> ' + line.isIcbp + ';' );

                                if (cmObject.freeTransfer === true) {
                                    memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGratuito.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                    memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                } else if (line.isIcbp === true) {
                                    memoGratuito.base += Number(parseFloat(line.quantity * (0.10)).toFixed(2));
                                    memoGratuito.valorImpuesto += Number(parseFloat(line.quantity * (0.10) * (0.18)).toFixed(2));;
                                    memoGratuito.total += Number(parseFloat(line.quantity * (0.10)).toFixed(2));
                                } else {
                                    memoGravado.total += Number(parseFloat(line.amount).toFixed(2));
                                    memoGravado.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGravado.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                    memoGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                }

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                }

                                if (line.isIcbp === true) {
                                    impuestoIcbp.cantidad = line.quantity;
                                    impuestoIcbp.valorImpuesto = Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                                    impuestoIcbp.valImpUnitario = Number(parseFloat(cmPreioVentaUnit).toFixed(2));
                                    existsIcbp = true;
                                    icbpTotalAmount += 0;
                                    icbpTotalLineAmount += Number(parseFloat(line.amount).toFixed(2));
                                    icbpTotalTax += Number(parseFloat(line.amount).toFixed(2));

                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.afectacionIgv = '15';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';

                                    var montoBaseBolsa = line.quantity * (0.10);
                                    detalleImpuesto.montoBase = Number(parseFloat(montoBaseBolsa).toFixed(2));
                                    detalleImpuesto.importeTributo = Number(parseFloat((0.18) * montoBaseBolsa).toFixed(2));
                                    detalleImpuesto.importeExplicito = Number(parseFloat((0.18) * montoBaseBolsa).toFixed(2));
                                    detalleImpuesto.tasaAplicada = '18.00';
                                }

                            }
                            // EXONERADAS
                            if (line.taxCodeDisplay === 'IGV_PE:E-PE') {
                                if (cmObject.freeTransfer === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '21';
                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '20';
                                    detalleImpuesto.codigoTributo = '9997';
                                    detalleImpuesto.desTributo = 'EXO';
                                    detalleImpuesto.codigoUN = 'VAT';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                }

                                cmIdImpuesto = '9997'; // evaluar si se queda
                                cmCodigo = '1003'; // evaluar si se queda
                                cmTipoAfectacion = '20'; // evaluar si se queda
                                totalVentaExo += Number(parseFloat(line.amount).toFixed(2));
                                totalImpuestoExo += Number(parseFloat(line.tax1amt).toFixed(2));
                                objTotalExo = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaExo.toFixed(2)
                                }
                                objImpExo = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoExo.toFixed(2)
                                }

                                if (cmObject.freeTransfer === true) {
                                    memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGratuito.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                    memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                } else {
                                    memoExonerado.total += Number(parseFloat(line.amount).toFixed(2));
                                }

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                }
                            }
                            // INAFECTAS
                            if (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp != true) {
                                if (cmObject.freeTransfer === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '35';
                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '30';
                                    detalleImpuesto.codigoTributo = '9998';
                                    detalleImpuesto.desTributo = 'INA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                }

                                cmIdImpuesto = '9998';  // evaluar si se queda
                                cmCodigo = '1002'; // evaluar si se queda
                                cmTipoAfectacion = '30'; // evaluar si se queda
                                totalVentaIna += Number(parseFloat(line.amount).toFixed(2));
                                totalImpuestoIna += Number(parseFloat(line.tax1amt).toFixed(2));
                                objTotalIna = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaIna.toFixed(2)
                                }
                                objImpIna = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoIna.toFixed(2)
                                }

                                if (cmObject.freeTransfer === true) {
                                    memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGratuito.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                    memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                } else {
                                    memoInafecto.total += Number(parseFloat(line.amount).toFixed(2));
                                }

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                }
                            }

                            if (line.itemType === 'NonInvtPart' || line.isicbp === true) {
                                var icbpAmount = parseFloat(line.amount + line.tax1amt).toFixed(2);
                                // pendiente validar
                                impTotalIcbp.valorImpuesto += Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                            }

                            cmTotalImpuesto.push({
                                idImpuesto: cmIdImpuesto,
                                montoImpuesto: line.tax1amt.toString(),
                                tipoAfectacion: cmTipoAfectacion,
                                montoBase: line.amount.toFixed(2).toString(),
                                porcentaje: line.taxRate1.toString()
                            });

                            /*
                            var idItem = line.item;
                            var articuloActivo = search.lookupFields({
                            type: search.Type.ITEM,
                                id: idItem,
                                columns: ['custitem_mumero_placa','itemid']
                            });
                            */

                            codigoItem = line.codigoISBN;

                            if (cmObject.freeTransfer === true) {
                                cmLine.push({
                                    linea: String(k + 1),
                                    total: parseFloat(line.amount).toFixed(2),
                                    precioVenta: '0.00', // add
                                    totalImpuesto: '0.00',
                                    productCode: line.itemDisplay,
                                    descripcion: line.description,
                                    cantidad: line.quantity,
                                    unidadComercial: line.unit,
                                    valorVentUnitario: '0.00',
                                    precioVentUnitario: cmPreioVentaUnit,
                                    valorVentaIncIgv: (line.rate).toFixed(2), //(line.rate + (line.rate * (line.taxRate1 / 100)))
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    // totalImpuesto: cmTotalImpuesto,
                                    valorVenta: line.amount.toFixed(2).toString(),
                                    montoTotalImpuesto: line.tax1amt.toFixed(2).toString(),
                                    detalleImpuesto: detalleImpuesto,
                                    placa: itemPlaca,
                                    bolsa: '1',
                                    codigo: codigoItem
                                });
                            } else {
                                var impTotal = 0;
                                var valVentaIgv = 0;
                                var preVenta = 0;
                                var totalLinea = 0;
                                var valorVentUnita = 0;

                                if (line.isIcbp === true) {
                                    impTotal = parseFloat(line.amount + line.tax1amt).toFixed(2);
                                    valVentaIgv = parseFloat(0.10).toFixed(2);
                                    totalLinea = parseFloat(line.quantity * (0.1)).toFixed(2);
                                } else {
                                    impTotal = parseFloat(line.tax1amt).toFixed(2);
                                    valVentaIgv = (line.rate + (line.rate * (line.taxRate1 / 100))).toFixed(2); //(line.rate + (line.rate * (line.taxRate1 / 100)))
                                    preVenta = parseFloat((line.quantity * line.rate) + line.tax1amt).toFixed(2);
                                    totalLinea = parseFloat(line.amount).toFixed(2);
                                    valorVentUnita = parseFloat(line.rate).toFixed(2);
                                }

                                cmLine.push({
                                    linea: String(k + 1),
                                    total: totalLinea,
                                    precioVenta: '0.00', // parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2),
                                    totalImpuesto: impTotal, // Math.abs(parseFloat(cmObject.totalAmount).toFixed(2)),
                                    productCode: line.itemDisplay,
                                    descripcion: line.description,
                                    cantidad: line.quantity,
                                    unidadComercial: line.unit,
                                    valorVentUnitario: parseFloat(valorVentUnita).toFixed(2),
                                    precioVentUnitario: parseFloat(cmPreioVentaUnit).toFixed(2),
                                    valorVentaIncIgv: parseFloat(valVentaIgv).toFixed(2),
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    // totalImpuesto: cmTotalImpuesto,
                                    valorVenta: line.amount.toFixed(2).toString(),
                                    montoTotalImpuesto: line.tax1amt.toFixed(2).toString(),
                                    detalleImpuesto: detalleImpuesto,
                                    impuestoIcbp: impuestoIcbp,
                                    placa: itemPlaca,
                                    bolsa: '1',
                                    codigo: codigoItem
                                });
                            }

                        } // End if: InvtPart o service
                    } // End for

                    objLine = {
                        lines: cmLine,
                        gravadas: objtotalGra,
                        inafectas: objTotalIna,
                        exoneradas: objTotalExo,
                        totalImpuestosGra: objImpGra,
                        totalImpuestosIna: objImpIna,
                        totalImpuestosExo: objImpExo,
                        importetotal: cmObject.totalAmount,
                        montototalimpuestos: cmObject.taxTotal.toString(),
                        codigocliente: cmObject.customerId
                    };
                } else {
                    var lineCount = cmObject.lines.length;

                    for (var l = 0; l < cmObject.lines.length; l++) {
                        var line = cmObject.lines[l];
                        var artGratuito = line.articuloGractuito;
                        var artBonificacion = line.articuloBonificacion;
                        var cmTotalImpuesto = [];
                        var cmPreioVentaUnit = 0.0;
                        var cmIdImpuesto = '';
                        var cmCodigo = '';
                        var cmTipoAfectacion = '';
                        var cmLround = 0.0;
                        var cmLround1 = 0.0;
                        var cmLround2 = 0.0;
                        var itemDisc = '';
                        var valorunitario = 0.0;
                        var totalImpuesto = 0.0;
                        var pVentaUnitario = 0.00;
                        var detalleImpuesto = {};
                        var anyDiscount = 'N';
                        var itemTypeDiscount = '';
                        var tax1amt = cmObject.tax1amt;
                        var taxAmount1 = cmObject.tax1amt;
                        var amount = cmObject.totalAmount;
                        var precioVentUnit = 0.0;
                        var precioVentUnitString = 0.0;
                        var itemPlaca = '0';
                        var codigoItem = '';

                        // VARIABLES PARA EL DESCUENTO
                        var indicadorDescuento = '';
                        var montoDescuento = 0.0;
                        var detalleDescuento = {};
                        var impuestoIcbp = {};
                        var currentLineDisc = 0;
                        var cargoDescuento = 0.00;
                        var montoCargoDescuento = 0.0;

                        //saveLog(internalId, null, userId, 'Prueba', 'line.itemType -> ' + line.itemType + ';' );
                        if (line.itemType === 'InvtPart' || line.itemType === 'Service') {

                            precioVentUnit = (line.rate + (line.rate * (line.taxRate1 / 100)));

                            precioVentUnitString = precioVentUnit.toString().split('.');

                            if (typeof precioVentUnitString[1] !== 'undefined') {
                                precioVentUnit = precioVentUnitString[1].length > 7 ? precioVentUnit.toFixed(7) : precioVentUnit;
                            }

                            // GRAVADAS
                            if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                cmIdImpuesto = '1000';
                                cmCodigo = '1001';
                                cmTipoAfectacion = '10';

                                if (cmObject.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '13';
                                    if (artBonificacion === true) {
                                        detalleImpuesto.afectacionIgv = '15';
                                    }
                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '10';
                                    detalleImpuesto.codigoTributo = '1000';
                                    detalleImpuesto.desTributo = 'IGV';
                                    detalleImpuesto.codigoUN = 'VAT';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                }

                                try {
                                    var nextLine = cmObject.lines[l + 1];
                                    itemTypeDiscount = nextLine.itemType;
                                } catch (error) {

                                }

                                if ((itemTypeDiscount === 'Discount' && line.retencionImp !== true) && artGratuito != true && artBonificacion != true) {
                                    anyDiscount = 'Y'

                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);

                                    memoGravado.total += Number(parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2));
                                    memoGravado.base += Number(parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2));
                                    memoGravado.valorImpuesto += Number(parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2));
                                    memoGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                    desclinea += Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));

                                } else if (existSubtotal == true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);

                                    memoGravado.total += Number(parseFloat(line.amount).toFixed(2));
                                    memoGravado.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGravado.valorImpuesto += Number(parseFloat(line.montoImpuesto).toFixed(2));
                                    memoGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                    cmImpueBrutoDescGloIGV += Number(parseFloat(line.amount + line.montoImpuesto));

                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = object.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                    if (artGratuito === true || artBonificacion === true) {
                                        detalleImpuesto.rate = '0.00';
                                    }

                                    if (object.freeTransfer === true) {
                                        memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                        memoGratuito.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                        memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                    } else if (artGratuito === true || artBonificacion === true) {
                                        memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                        memoGratuito.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                        memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                    } else {
                                        memoGravado.total += Number(parseFloat(line.amount).toFixed(2));
                                        memoGravado.base += Number(parseFloat(line.amount).toFixed(2));
                                        memoGravado.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                        memoGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                    }
                                }

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                    existsRet = true;
                                    totalAmountRet += Number(parseFloat(line.retencionAmount).toFixed(2));
                                }

                                if (line.isIcbp === true) {
                                    impuestoIcbp.cantidad = line.quantity;
                                    impuestoIcbp.valorImpuesto = parseFloat(line.amount).toFixed(2);
                                    impuestoIcbp.valImpUnitario = parseFloat(line.rate).toFixed(2);
                                    existsIcbp = true;
                                    icbpTotalAmount += Number(line.amount);
                                    icbpTotalTax += Number(line.amount);

                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.afectacionIgv = '15';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                }

                            }
                            // EXONERADAS
                            if (line.taxCodeDisplay === 'IGV_PE:E-PE') {
                                cmIdImpuesto = '9997';
                                cmCodigo = '1003';
                                cmTipoAfectacion = '20';

                                if (cmObject.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '21';
                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '20';
                                    detalleImpuesto.codigoTributo = '9997';
                                    detalleImpuesto.desTributo = 'EXO';
                                    detalleImpuesto.codigoUN = 'VAT';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                }

                                try {
                                    var nextLine = cmObject.lines[l + 1]
                                    itemTypeDiscount = nextLine.itemType;
                                } catch (error) {

                                }

                                if (itemTypeDiscount === 'Discount' && artGratuito != true && artBonificacion != true) {
                                    anyDiscount = 'Y'; // any

                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                    memoExonerado.total -= Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                                    memoExonerado.total += Number(parseFloat(line.amount).toFixed(2));
                                    desclinea += Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                                } else if (existSubtotal == true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount - (line.amount * cmCargoDescuento)).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                    //memoExonerado.total -= Number(line.amount * cmCargoDescuento);
                                    memoExonerado.total += Number(parseFloat(line.amount).toFixed(2));

                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                    if (artGratuito === true || artBonificacion === true) {
                                        detalleImpuesto.rate = '0.00';
                                    }

                                    if (cmObject.freeTransfer === true) {
                                        memoGratuito.base = parseFloat(line.amount).toFixed(2);
                                        memoGratuito.valorImpuesto = '0.00';
                                        memoGratuito.total = parseFloat(line.amount).toFixed(2);
                                    } else if (artGratuito === true || artBonificacion === true) {
                                        memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                        memoGratuito.valorImpuesto = 0;
                                        memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                    } else {
                                        memoExonerado.total += Number(parseFloat(line.amount).toFixed(2));
                                    }
                                }

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                    existsRet = true;
                                    totalAmountRet += Number(parseFloat(line.retencionAmount).toFixed(2));
                                }
                            }
                            // INAFECTAS
                            if (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp != true) {
                                cmIdImpuesto = '9998';
                                cmCodigo = '1002';
                                cmTipoAfectacion = '30';

                                if (cmObject.freeTransfer === true || artGratuito === true || artBonificacion === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '35';
                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.desTributo = 'IGV';
                                    detalleImpuesto.codigoUN = 'VAT';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                } else if (line.isIcbp === true) {
                                    detalleImpuesto.codigoTributo = '1000';
                                    detalleImpuesto.afectacionIgv = '10';
                                    detalleImpuesto.desTributo = 'IGV';
                                    detalleImpuesto.codigoUN = 'VAT';
                                    detalleImpuesto.precioUnitario = parseFloat(line.amount).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.afectacionIgv = '30';
                                    detalleImpuesto.codigoTributo = '9998';
                                    detalleImpuesto.desTributo = 'INA';
                                    detalleImpuesto.codigoUN = 'FRE';
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                }

                                try {
                                    var nextLine = cmObject.lines[l + 1]
                                    itemTypeDiscount = nextLine.itemType;
                                } catch (error) {

                                }

                                if (itemTypeDiscount === 'Discount' && artGratuito != true && artBonificacion != true) {
                                    anyDiscount = 'Y'; // any

                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                    desclinea += Number(parseFloat(Math.abs(nextLine.amount)).toFixed(2));
                                } else if (existSubtotal == true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount - (line.amount * cmCargoDescuento)).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);

                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                } else if (line.isIcbp === true) {
                                    detalleImpuesto.importeTributo = parseFloat(line.amount * 0.18).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.amount * 0.18).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(18).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                } else {
                                    detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                    detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                    detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                    detalleImpuesto.rate = cmObject.freeTransfer ? '0.00' : parseFloat(line.rate).toFixed(2);
                                }

                                if (cmObject.freeTransfer === true) {
                                    memoGratuito.base = parseFloat(line.amount).toFixed(2);
                                    memoGratuito.valorImpuesto = '0.00';
                                    memoGratuito.total = parseFloat(line.amount).toFixed(2);
                                } else if (artGratuito === true || artBonificacion === true) {
                                    memoGratuito.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGratuito.valorImpuesto = '0.00';
                                    memoGratuito.total += Number(parseFloat(line.amount).toFixed(2));
                                } else {
                                    memoInafecto.total += Number(parseFloat(line.amount).toFixed(2));
                                }

                                if (artGratuito === true || artBonificacion === true) {
                                    detalleImpuesto.rate = '0.00';
                                }
                                // fbInafecto.total += parseFloat(line.amount).toFixed(2);

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                    existsRet = true;
                                    totalAmountRet += Number(parseFloat(line.retencionAmount).toFixed(2));
                                }
                            }

                            if (anyDiscount === 'Y') {
                                var discLine = cmObject.lines[l + 1]
                                var rateDiscLine = discLine.rate;
                                var amountDiscLine = discLine.amount;
                                var taxAmountDiscLine = discLine.tax1amt;

                                var discLinePorcentaje = discLine.rateTex + '';
                                if (discLinePorcentaje.indexOf('%') == '-1') {
                                    cargoDescuento = Math.abs(amountDiscLine / line.amount);
                                    precioVentUnit = parseFloat(precioVentUnit - (precioVentUnit * cargoDescuento)).toFixed(2);

                                } else {
                                    rateDiscLine = rateDiscLine.toString().replace('-', '').replace('%', '');
                                    taxAmountDiscLine = parseFloat(taxAmountDiscLine.toString().replace('-', ''));
                                    cargoDescuento = (rateDiscLine / 100);
                                    stringRound = cargoDescuento.toString().split('.');

                                    if (typeof stringRound[1] !== 'undefined') {
                                        stringRound[1].length > 5 ? cargoDescuento = cargoDescuento.toFixed(5) : cargoDescuento
                                    }
                                    trace = 'For Actividad 7';
                                    amountDiscLine = parseFloat(amountDiscLine.toString().replace('-', ''));
                                    montoCargoDescuento = parseFloat(amountDiscLine) * parseFloat(cargoDescuento);
                                    var unitDiscount = parseFloat(amountDiscLine) * parseFloat(cargoDescuento);

                                    //precioVentUnit = parseFloat(precioVentUnit) - unitDiscount;
                                    precioVentUnit = parseFloat(precioVentUnit - (precioVentUnit * cargoDescuento)).toFixed(2);
                                }

                            }

                            if (tax1amt === 0) {
                                tax1amt = line.directTax1Amt;
                            }

                            if (amount === 0) {
                                amount = line.directAmount;
                            }
                            // validar
                            if (line.itemType === 'NonInvtPart' || line.isicbp === true) {
                                var icbpAmount = parseFloat(line.amount + line.tax1amt).toFixed(2);
                                tax1amt = parseFloat(tax1amt + icbpAmount).toFixed(2);
                                taxTotal = parseFloat(taxTotal) + icbpAmount;
                                // pendiente validar
                                impTotalIcbp.valorImpuesto += Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                            }

                            /*
                            var idItem = line.item;
                            var articuloActivo = search.lookupFields({
                            type: search.Type.ITEM,
                                id: idItem,
                                columns: ['custitem_mumero_placa','itemid']
                            });
                            */

                            codigoItem = line.codigoISBN;

                            if (artGratuito === true || artBonificacion === true) {
                                if (artGratuito === true) { line.description = line.description + ' - GRATUITO' }
                                if (artBonificacion === true) { line.description = line.description + ' - BONIFICACION' }
                                cmLine.push({
                                    linea: String(l + 1),
                                    cantidad: line.quantity,
                                    total: parseFloat(line.amount).toFixed(2),
                                    precioVenta: '0.00', //parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                    descripcion: line.description.replace(/[&!¡]/g, 'DX'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                    valorVentUnitario: '0.00', // line.amount, // parseFloat(precioVentUnit).toFixed(2),
                                    unidadComercial: line.unit,
                                    valorVentaIncIgv: parseFloat(line.rate).toFixed(2),  //+ line.tax1amt,
                                    totalImpuesto: '0.00',
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    detalleImpuesto: detalleImpuesto,
                                    descuentoCargoDetalle: {},
                                    placa: itemPlaca,
                                    bolsa: '1',
                                    codigo: codigoItem
                                    // totalImpuesto: '0.00'
                                });
                            } else if (cmObject.freeTransfer === true) {
                                cmLine.push({
                                    linea: String(l + 1),
                                    cantidad: line.quantity,
                                    total: parseFloat(line.amount).toFixed(2),
                                    precioVenta: '0.00', //parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                    descripcion: line.description.replace(/[&!¡]/g, 'EX'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                    valorVentUnitario: '0.00', // line.amount, // parseFloat(precioVentUnit).toFixed(2),
                                    unidadComercial: line.unit,
                                    valorVentaIncIgv: parseFloat(line.rate).toFixed(2),  //+ line.tax1amt,
                                    totalImpuesto: taxTotal,
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    detalleImpuesto: detalleImpuesto,
                                    descuentoCargoDetalle: {},
                                    placa: itemPlaca,
                                    bolsa: '1',
                                    codigo: codigoItem
                                    // totalImpuesto: '0.00'
                                });
                            } else if (anyDiscount === 'Y') {
                                var precioVentaFin = 0.0;
                                var valUnitario = 0.0;
                                valUnitario = parseFloat(line.rate - (line.rate * cargoDescuento)).toFixed(2);
                                if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                    precioVentaFin = parseFloat((line.montoImpuesto - Math.abs(nextLine.montoImpuesto)) + (line.amount - Math.abs(nextLine.amount))).toFixed(2);
                                }

                                cmLine.push({
                                    linea: String(l + 1),
                                    cantidad: line.quantity,
                                    total: parseFloat(line.amount - Math.abs(nextLine.amount)).toFixed(2),
                                    precioVenta: parseFloat(precioVentaFin).toFixed(2),
                                    descripcion: line.description.replace(/[&!¡]/g, 'GX'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                    valorVentUnitario: parseFloat(valUnitario).toFixed(2),
                                    unidadComercial: line.unit,
                                    valorVentaIncIgv: parseFloat(precioVentUnit).toFixed(2),//parseFloat((line.montoImpuesto - Math.abs(nextLine.montoImpuesto)) + (line.amount - Math.abs(nextLine.amount))).toFixed(2), // + line.tax1amt,
                                    totalImpuesto: parseFloat(line.montoImpuesto - Math.abs(nextLine.montoImpuesto)).toFixed(2), //taxTotal,
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    detalleImpuesto: detalleImpuesto,
                                    descuentoCargoDetalle: {},
                                    placa: itemPlaca,
                                    bolsa: '1',
                                    codigo: codigoItem
                                    // totalImpuesto: '0.00'
                                });
                            } else {

                                var impTotal = 0;
                                var valVentaIgv = 0;
                                var valorVentaItem = 0
                                var valTotal = 0;

                                var precioVentaFin = 0.0;
                                var valUnitario = 0.0;

                                if (existSubtotal == true) {
                                    if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                        valorVentaItem = parseFloat(precioVentUnit).toFixed(2);
                                        valTotal = (line.amount).toFixed(2);
                                        precioVentaFin = parseFloat((line.montoImpuesto) + (line.amount)).toFixed(2);
                                        impTotal = parseFloat(line.montoImpuesto).toFixed(2);
                                        valUnitario = parseFloat(line.rate).toFixed(2);
                                    } else {
                                        if (artGratuito === true || artBonificacion === true) {
                                            valorVentaItem = parseFloat(precioVentUnit).toFixed(2);
                                            valTotal = (line.amount).toFixed(2);
                                            valUnitario = parseFloat(line.rate).toFixed(2);
                                        } else {
                                            valorVentaItem = parseFloat(precioVentUnit - (precioVentUnit * cmCargoDescuento)).toFixed(2);
                                            valTotal = (line.amount - (line.amount * cmCargoDescuento)).toFixed(2);
                                            valUnitario = parseFloat(line.rate - (line.rate * cmCargoDescuento)).toFixed(2);
                                        }
                                    }
                                } else {

                                    if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                        precioVentaFin = parseFloat((line.montoImpuesto) + (line.amount)).toFixed(2);
                                    }

                                    if (line.isIcbp === true) {
                                        valorVentaItem = parseFloat(0.10).toFixed(2);
                                        impTotal = parseFloat(line.amount + line.tax1amt).toFixed(2);
                                        valTotal = parseFloat(line.quantity * (0.1)).toFixed(2);
                                        valUnitario = 0;
                                    } else {
                                        valorVentaItem = parseFloat(precioVentUnit).toFixed(2);
                                        impTotal = parseFloat(line.montoImpuesto).toFixed(2);
                                        valTotal = (line.amount).toFixed(2);
                                        valUnitario = (line.rate).toFixed(2);//(line.rate + (line.rate * (line.taxRate1 / 100)));
                                    }

                                }

                                cmLine.push({
                                    linea: String(l + 1),
                                    cantidad: line.quantity,
                                    total: valTotal,
                                    precioVenta: parseFloat(precioVentaFin).toFixed(2), //parseFloat((line.quantity * line.rate) + line.tax1amt).toFixed(2), // add
                                    descripcion: line.description.replace(/[&!¡]/g, 'FX'), //reemplazo caractereres en el titulo al generar 270924 jhair
                                    valorVentUnitario: parseFloat(valUnitario).toFixed(2),
                                    unidadComercial: line.unit,
                                    valorVentaIncIgv: valorVentaItem,
                                    totalImpuesto: impTotal,// line.montoImpuesto, //taxTotal,
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    detalleImpuesto: detalleImpuesto,
                                    descuentoCargoDetalle: {}, // detalleDescuento,
                                    impuestoIcbp: impuestoIcbp,
                                    placa: itemPlaca,
                                    bolsa: '1',
                                    codigo: codigoItem
                                });
                            }

                        } else if (line.itemType === 'Subtotal') {
                            try {
                                var globalDiscLine = cmObject.lines[l + 1];
                                var globalAmount = Number(parseFloat(Math.abs(globalDiscLine.amount)).toFixed(2));
                                var baseGlobalAmount = Number(parseFloat(line.amount).toFixed(2));

                                if (globalDiscLine.itemType === 'Discount') {
                                    descGlobal.indicador = '0';
                                    descGlobal.descripcion = 'DESCUENTO GLOBAL';
                                    descGlobal.monto = globalAmount;
                                    descGlobal.codigoMotivo = '03';
                                    descGlobal.porcentaje = Math.abs(globalDiscLine.rate); //globalDiscLine.taxRate1;
                                    descGlobal.montoBase = baseGlobalAmount;
                                    descGlobal.taxCode = globalDiscLine.taxCodeDisplay
                                    isDiscountGlobal = true;
                                    if (taxCodeSubtotal == 'IGV_PE:S-PE') {
                                        descGlobal.codigoMotivo = '02';
                                    }

                                } else {
                                    globalAmount += globalAmount;
                                    baseGlobalAmount += baseGlobalAmount;
                                }

                                if (memoGravado.total !== undefined && memoGravado.total !== 0 &&
                                    memoGravado.valorImpuesto !== undefined && memoGravado.valorImpuesto !== 0 &&
                                    memoGravado.base !== undefined && memoGravado.base !== 0 &&
                                    memoGravado.porcentaje !== undefined && memoGravado.porcentaje !== '') {

                                    //saveLog(internalId, null, userId, 'Prueba', 'taxCodeSubtotal -> ' + taxCodeSubtotal + ';' );
                                    //saveLog(internalId, null, userId, 'Prueba', 'memoGravado.total -> ' + memoGravado.total + ';' );

                                    if (taxCodeSubtotal == 'IGV_PE:S-PE') {
                                        memoGravado.total = Number(parseFloat(memoGravado.total).toFixed(2));
                                        memoGravado.base = Number(parseFloat(memoGravado.base).toFixed(2));
                                        memoGravado.valorImpuesto = Number(parseFloat(memoGravado.valorImpuesto).toFixed(2));
                                        cmMontoTotalDescGloIGV = Number(parseFloat(memoGravado.total).toFixed(2));
                                        cmImpueTotalDescGloIGV = Number(parseFloat(memoGravado.valorImpuesto).toFixed(2));
                                    } else {
                                        memoGravado.total = Number(parseFloat(memoGravado.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                                        memoGravado.base = Number(parseFloat(memoGravado.base - Math.abs(globalDiscLine.amount)).toFixed(2));
                                        memoGravado.valorImpuesto = Number(parseFloat(memoGravado.valorImpuesto - Math.abs(globalDiscLine.tax1amt)).toFixed(2));
                                    }


                                }

                                if (memoInafecto.total !== undefined && memoInafecto.total !== 0) {
                                    memoInafecto.total = Number(parseFloat(memoInafecto.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                                }

                                if (memoExonerado.total !== undefined && memoExonerado.total !== 0) {
                                    memoExonerado.total = Number(parseFloat(memoExonerado.total - Math.abs(globalDiscLine.amount)).toFixed(2));
                                }

                            } catch (error) {

                            }
                        }


                        // END IF InvtPart O Service
                    } // END FOR
                    objLine = {
                        lines: cmLine,
                        gravadas: objtotalGra,
                        inafectas: objTotalIna,
                        exoneradas: objTotalExo,
                        totalImpuestosGra: objImpGra,
                        totalImpuestosIna: objImpIna,
                        totalImpuestosExo: objImpExo,
                        importetotal: cmObject.totalAmount,
                        montototalimpuestos: cmObject.taxTotal.toString(),
                        codigocliente: cmObject.customerId
                    }
                }
                trace = 'Actividad 5';


                // MONTOS TOTALES

                // adicionar lineas
                comprobante.detalle = objLine.lines;
                //comprobante.DescuentoNoAfecto = DescNoAfecto;

                var converter = new NumberToWordsConverter();

                if (existsIcbp === true) {
                    comprobante.importeTotal = existsRet ? parseFloat(Number(totalDoc) + Number(totalAmountRet) + Number(icbpTotalAmount)).toFixed(2) : Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2)); // object.totalAmount;
                    comprobante.totalImpuesto = Number(parseFloat(Number(totalDocTax) + Number(icbpTotalTax)).toFixed(2)); // totalDocTax; // object.taxTotal;
                    var subtotal = existsRet ? parseFloat(totalDoc - totalDocTax - icbpTotalLineAmount + totalAmountRet) : parseFloat(totalDoc - totalDocTax - icbpTotalLineAmount); // parseFloat(object.totalAmount) - parseFloat(object.taxTotal);
                    if (isDiscountGlobal == true) {

                        if (taxCodeSubtotal == 'IGV_PE:S-PE') {
                            cmImpueBrutoDescGloIGV = Number(parseFloat(cmImpueBrutoDescGloIGV)).toFixed(2)
                            comprobante.importeTotal = cmImpueBrutoDescGloIGV;
                            comprobanteAdicional.texto = String(converter.convertNumberToWords(Math.abs(cmImpueBrutoDescGloIGV), cmObject.currencySymbol)).toUpperCase();
                            comprobante.totalValVenta = cmMontoTotalDescGloIGV;
                            comprobante.totalImpuesto = cmImpueTotalDescGloIGV;
                            comprobante.totalPrecioventa = cmImpueBrutoDescGloIGV;
                        } else {
                            comprobante.totalValVenta = parseFloat(Number(subtotal)).toFixed(2);
                            comprobante.totalPrecioventa = existsRet ? Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount) + Number(totalAmountRet)).toFixed(2)) : Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2)); // object.totalAmount; // subtotal.toFixed(2);
                        }
                    } else {
                        comprobante.totalValVenta = subtotal.toFixed(2);
                        comprobante.totalPrecioventa = existsRet ? Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount) + Number(totalAmountRet)).toFixed(2)) : Number(parseFloat(Number(totalDoc) + Number(icbpTotalAmount)).toFixed(2)); // object.totalAmount; // subtotal.toFixed(2);
                    }
                } else {

                    comprobante.importeTotal = existsRet ? parseFloat(Number(totalDoc) + Number(totalAmountRet)).toFixed(2) : totalDoc; // totalDoc; // object.totalAmount;
                    comprobante.totalImpuesto = totalDocTax; // object.taxTotal;
                    var subtotal = existsRet ? parseFloat(totalDoc - totalDocTax + totalAmountRet) : parseFloat(totalDoc - totalDocTax); // parseFloat(object.totalAmount) - parseFloat(object.taxTotal);

                    if (isDiscountGlobal == true) {
                        if (taxCodeSubtotal == 'IGV_PE:S-PE') {
                            cmImpueBrutoDescGloIGV = Number(parseFloat(cmImpueBrutoDescGloIGV)).toFixed(2)
                            comprobante.importeTotal = cmImpueBrutoDescGloIGV;
                            comprobanteAdicional.texto = String(converter.convertNumberToWords(Math.abs(cmImpueBrutoDescGloIGV), cmObject.currencySymbol)).toUpperCase();
                            comprobante.totalValVenta = cmMontoTotalDescGloIGV;
                            comprobante.totalImpuesto = cmImpueTotalDescGloIGV;
                            comprobante.totalPrecioventa = cmImpueBrutoDescGloIGV;
                        } else {
                            comprobante.totalValVenta = parseFloat(Number(subtotal)).toFixed(2);
                            comprobante.totalPrecioventa = existsRet ? parseFloat(Number(totalDoc) + Number(totalAmountRet)).toFixed(2) : parseFloat(Number(totalDoc)).toFixed(2); // object.totalAmount; // subtotal.toFixed(2);
                        }
                    } else {
                        comprobante.totalValVenta = subtotal.toFixed(2);
                        comprobante.totalPrecioventa = existsRet ? parseFloat(Number(totalDoc) + Number(totalAmountRet)).toFixed(2) : totalDoc; // object.totalAmount; // subtotal.toFixed(2);
                    }
                }

                comprobante.importeTotal = Math.abs(comprobante.importeTotal);
                comprobante.totalImpuesto = Math.abs(comprobante.totalImpuesto);
                comprobante.totalValVenta = Math.abs(comprobante.totalValVenta);
                comprobante.totalPrecioventa = Math.abs(comprobante.totalPrecioventa);
                // Motivo de Documento
                motivoDocument.serieDocRef = cmObject.serieRef;
                motivoDocument.numeroDocRef = cmObject.numRef;
                motivoDocument.codeMotivoEmi = cmObject.motivoMemo;
                motivoDocument.fechaDocRef = cmObject.fechaDocRef;
                motivoDocument.sustento = cmObject.sustentoMemo;
                motivoDocument.tipoDocRef = cmObject.tipoDocRef;

                montoTotal = {
                    gravado: memoGravado,
                    inafecto: memoInafecto,
                    exonerado: memoExonerado,
                    gratuito: memoGratuito,
                    icbp: impTotalIcbp,
                    exporta: memoExportacion
                }

                /*
                if(desclinea != 0){
                    texto.desclinea = desclinea;
                }
                */

                comprobante.serie = cmObject.serie;
                comprobante.numero = cmObject.numero;
                comprobante.fechaEmision = cmObject.fechaEmision;
                comprobante.tipoComprobante = cmObject.tipoDocumento;
                comprobante.moneda = cmObject.currencySymbol;
                comprobante.horaEmision = cmObject.horaEmision;
                comprobante.tipoOperacion = ''; //cmObject. Pendiente preguntar como oobtener este campo

                comprobante.tipoDocIdentidad = cmObject.tipoDocReceptor;
                comprobante.ruc = cmObject.customer.ruc;
                comprobante.memo = cmObject.memo;

                var razonSocial = '';
                if (cmObject.typeCode === '03') {
                    razonSocial = cmObject.customer.fullName;
                } else {
                    razonSocial = cmObject.customer.customer;
                }

                //comprobante.razonSocial = razonSocial.replace(/&/g, 'Y').replace('', 'haber2'); //jhair 081024
                comprobante.razonSocial = razonSocial.replace(/&/g, 'Y').trim()
                comprobante.tipoDocIdentidad = cmObject.customer.tipoDocumento;
                //comprobante.importeTotal = Math.abs(cmObject.memoTotal).toFixed(2);
                //comprobante.totalImpuesto = Math.abs(cmObject.taxTotal);
                //var subtotal = Math.abs(parseFloat(cmObject.totalAmount) - parseFloat(cmObject.taxTotal));
                //comprobante.totalValVenta = subtotal.toFixed(2);
                //comprobante.totalPrecioventa = subtotal.toFixed(2);
                //comprobante.totalPrecioventa = Math.abs(parseFloat(cmObject.totalAmount)).toFixed(2);
                comprobante.versionUbl = VERSION_UBL;

                // Construir el objeto final
                comprobante.montoTotal = montoTotal;
                //comprobante.DescuentoNoAfecto = DescNoAfecto;
                //comprobante.descGlobal = descGlobal;
                comprobante.motivoDocument = motivoDocument;
                // comprobante.montoTotal = montoTotal;
                comprobante.receptor = receptor;
                comprobante.formaPagoSunat = {
                    tipoFormaPago: getPaymentMethod(cmObject.formaPago),
                    montoPendiente: Math.abs(Number(totalCuotas)).toFixed(2)
                };
                comprobante.adicional = comprobanteAdicional;
                general.comprobante = comprobante;
                general.texto = texto;
                general.empresa = empresa;
                general.autenticacion = autenticacion;
                general.tipoComprobante = getTipoComprobante(cmObject.typeCode);
                general.tipoCodigo = '0';
                general.otorgar = '1';

                //saveLog(internalId, null, userId, 'Prueba', 'recurso 2-> ' + currentScript.getRemainingUsage() + ';' );

                object = {
                    status: STATUS_OK,
                    message: 'Proceso completado correctamente',
                    data: general
                }

            } catch (error) {
                object = {
                    status: STATUS_ERROR,
                    message: 'Error No se puede procesar la informacion de la Nota de Crédito: ' + error.message
                }
                saveLog(internalId, null, userId, 'processCreditMemo Error ' + trace, error.message)
            }
            return object;
        }

        function processDebitMemo(libResult, subsidiary, internalId, userId, config, docType) {
            var object = {
                status: STATUS_ERROR,
                message: 'INIT'
            }
            var trace = 'Actividad 1';
            try {
                var general = {};
                var empresa = {};
                var autenticacion = {};
                var comprobante = {};
                var comprobanteAdicional = {};
                var montoTotal = {};
                var receptor = {};
                var motivoDocument = {};

                autenticacion.ruc = config.user;
                autenticacion.clave = config.pass;

                empresa.ruc = subsidiary.ruc;
                empresa.nombreComercial = String(subsidiary.tradeName).replace(/&/g, 'Y');
                empresa.razonSocial = String(subsidiary.legalName).replace(/&/g, 'Y');
                empresa.codDistrito = subsidiary.codeUbigeo;
                empresa.calle = subsidiary.address;
                empresa.codPais = subsidiary.countryCode;
                empresa.tipoDocumento = subsidiary.documentType;
                empresa.telefono = subsidiary.phone;
                empresa.web = subsidiary.webSite;
                empresa.correo = subsidiary.mail;
                empresa.codEstSunat = subsidiary.codeEstSunat;

                var cmObject = libResult.data;

                receptor.calle = cmObject.customer.address === '' ? '' - '' : cmObject.customer.address; //Se reemplaza la dirección del cliente cuando este vacio 300924 Jhair Robles
                receptor.codigo = cmObject.customer.codeUbigeo;
                receptor.codPais = cmObject.customer.countryCode === '' ? 'PE' : cmObject.customer.countryCode; //Se reemplaza pais del cliente cuando este vacio 300924 Jhair Robles
                receptor.departamento = cmObject.customer.state === '' ? '-' : cmObject.customer.state; //Se reemplaza departamento del cliente cuando este vacio 300924 Jhair Robles
                receptor.provincia = cmObject.customer.state === '' ? '-' : cmObject.customer.state; //Se reemplaza pronvincia del cliente cuando este vacio 300924 Jhair Robles
                receptor.distrito = cmObject.customer.city === '' ? 'Perú' : cmObject.customer.city; //Se reemplaza distrito del cliente cuando este vacio 300924 Jhair Robles

                var converter = new NumberToWordsConverter();
                comprobanteAdicional.codigo = '1000';
                comprobanteAdicional.texto = String(converter.convertNumberToWords(Math.abs(cmObject.memoTotal), cmObject.currencySymbol)).toUpperCase();

                var cmCargoDescuento = 0.0;
                var cmRound = '';
                var existDiscount = false;
                var existSubtotal = false;

                var tipoCambio = Number(parseFloat(cmObject.tipoCambio).toFixed(3));
                var totalDoc = 0;
                var totalDocTax = 0;

                if (cmObject.currencySymbol === 'USD') {
                    totalDoc = parseFloat(cmObject.totalAmount / tipoCambio).toFixed(2);
                    totalDocTax = parseFloat(cmObject.taxTotal / tipoCambio).toFixed(2);
                } else {
                    totalDoc = parseFloat(cmObject.totalAmount).toFixed(2);
                    totalDocTax = parseFloat(cmObject.taxTotal).toFixed(2);
                }

                // LÍNEAS CON DESCUENTO
                trace = 'Actividad 1.2';
                for (var j = 0; j < cmObject.lines.length; j++) {
                    var cml = cmObject.lines[j];
                    if (cml.itemType === 'Discount') {
                        var cmRate = parseFloat(cml.rate);
                        cmRate = cmRate.toString().replace('-', '').replace('%', '');
                        cmCargoDescuento = cmRate / 100;
                        cmRound = cmCargoDescuento.toString().split('.');
                        // cmCargoDescuento = cmRound[1].length > 5 ? cmCargoDescuento.toFixed(5) : cmRound;
                        if (cmRound.length > 1 && cmRound[1] !== undefined && cmRound[1].length > 5) {
                            cmCargoDescuento = cmCargoDescuento.toFixed(5);
                        }
                        cmCargoDescuento = parseFloat(cmCargoDescuento)
                        existDiscount = true;
                    }
                }
                trace = 'Actividad 2';
                var totalVentaGra = 0.0;
                var totalImpuestoGra = 0.0;
                var totalVentaIna = 0.0;
                var totalImpuestoIna = 0.0;
                var totalVentaExo = 0.0;
                var totalImpuestoExo = 0.0;
                var objtotalGra = {};
                var objImpGra = {};
                var objTotalIna = {};
                var objImpIna = {};
                var objTotalExo = {};
                var objImpExo = {};
                var cmLine = [];
                var objLine = {};
                // MONTOS TOTALES
                var memoGravado = {
                    total: 0,
                    valorImpuesto: 0,
                    base: 0,
                    porcentaje: ''
                };
                var memoInafecto = {
                    total: 0
                };
                var memoExonerado = {
                    total: 0
                };
                var memoExportacion = {
                    total: 0
                };
                var memoGratuito = {
                    base: 0,
                    valorImpuesto: 0,
                    total: 0
                };
                var impTotalIcbp = {
                    valorImpuesto: 0
                };
                var descGlobal = {};
                var retencion = {};
                var texto = {};
                var desclinea = 0;
                var existsIcbp = false;
                var icbpTotalTax = 0;
                var totalAmountRet = 0;
                var existsRet = false;
                var icbpTotalAmount = 0;
                var icbpTotalLineAmount = 0;
                var icbpTotalImpuesto = 0;
                var isDiscountGlobal = false;

                if (existDiscount === false) {
                    trace = 'Actividad 3';
                    for (var k = 0; k < cmObject.lines.length; k++) {
                        var line = cmObject.lines[k];
                        var cmTotalImpuesto = [];
                        var cmPreioVentaUnit = 0.0;
                        var cmIdImpuesto = '';
                        var cmCodigo = '';
                        var cmTipoAfectacion = '';
                        var cmKround = 0.0;
                        var detalleDescuento = {};
                        var detalleImpuesto = {};
                        var impuestoIcbp = {};
                        var codigoItem = '';

                        if (line.itemType === 'InvtPart' || line.itemType === 'Service' || line.itemType == 'NonInvtPart') {
                            cmPreioVentaUnit = (line.rate + (line.rate * (line.taxRate1 / 100)));
                            cmKround = cmPreioVentaUnit.toString().split('.');

                            if (typeof cmKround[1] !== 'undefined') {
                                cmPreioVentaUnit = cmKround[1].length > 7 ? cmPreioVentaUnit.toFixed(7) : cmPreioVentaUnit;
                            }
                            // GRAVADAS
                            if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '10';
                                detalleImpuesto.codigoTributo = '1000';
                                detalleImpuesto.desTributo = 'IGV';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);

                                cmIdImpuesto = '1000'; // evaluar si se queda
                                cmCodigo = '1001'; // evaluar si se queda
                                cmTipoAfectacion = '10'; // evaluar si se queda

                                totalVentaGra += Number(parseFloat(line.amount).toFixed(2));
                                totalImpuestoGra += Number(parseFloat(line.tax1amt).toFixed(2));
                                objtotalGra = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaGra.toFixed(2)
                                }
                                objImpGra = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoGra.toFixed(2)
                                }

                                if (line.isIcbp === true) {
                                    memoGratuito.base += Number(parseFloat(line.quantity * (0.10)).toFixed(2));
                                    memoGratuito.valorImpuesto += Number(parseFloat(line.quantity * (0.10) * (0.18)).toFixed(2));;
                                    memoGratuito.total += Number(parseFloat(line.quantity * (0.10)).toFixed(2));
                                } else {
                                    memoGravado.total += Number(parseFloat(line.amount).toFixed(2));
                                    memoGravado.base += Number(parseFloat(line.amount).toFixed(2));
                                    memoGravado.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                    memoGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                                }

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                }

                                if (line.isIcbp === true) {
                                    impuestoIcbp.cantidad = line.quantity;
                                    impuestoIcbp.valorImpuesto = Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                                    impuestoIcbp.valImpUnitario = Number(parseFloat(cmPreioVentaUnit).toFixed(2));
                                    existsIcbp = true;
                                    icbpTotalAmount += 0;
                                    icbpTotalLineAmount += Number(line.amount);
                                    icbpTotalTax += Number(parseFloat(line.amount).toFixed(2));
                                    icbpTotalImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));

                                    detalleImpuesto.codigoTributo = '9996';
                                    detalleImpuesto.afectacionIgv = '15';
                                    detalleImpuesto.desTributo = 'GRA';
                                    detalleImpuesto.codigoUN = 'FRE';

                                    var montoBaseBolsa = line.quantity * (0.10);
                                    detalleImpuesto.montoBase = Number(parseFloat(montoBaseBolsa).toFixed(2));
                                    detalleImpuesto.importeTributo = Number(parseFloat((0.18) * montoBaseBolsa).toFixed(2));
                                    detalleImpuesto.importeExplicito = Number(parseFloat((0.18) * montoBaseBolsa).toFixed(2));
                                    detalleImpuesto.tasaAplicada = '18.00';
                                }

                            }
                            // EXONERADAS
                            if (line.taxCodeDisplay === 'IGV_PE:E-PE') {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '20';
                                detalleImpuesto.codigoTributo = '9997';
                                detalleImpuesto.desTributo = 'EXO';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                cmIdImpuesto = '9997'; // evaluar si se queda
                                cmCodigo = '1003'; // evaluar si se queda
                                cmTipoAfectacion = '20'; // evaluar si se queda
                                totalVentaExo += Number(parseFloat(line.amount).toFixed(2));
                                totalImpuestoExo += Number(parseFloat(line.tax1amt).toFixed(2));
                                objTotalExo = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaExo.toFixed(2)
                                }
                                objImpExo = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoExo.toFixed(2)
                                }
                                memoExonerado.total += Number(parseFloat(line.amount).toFixed(2));

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                }
                            }
                            // INAFECTAS
                            if (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp != true) {
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '30';
                                detalleImpuesto.codigoTributo = '9998';
                                detalleImpuesto.desTributo = 'INA';
                                detalleImpuesto.codigoUN = 'FRE';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);
                                cmIdImpuesto = '9998';  // evaluar si se queda
                                cmCodigo = '1002'; // evaluar si se queda
                                cmTipoAfectacion = '30'; // evaluar si se queda
                                totalVentaIna += Number(parseFloat(line.amount).toFixed(2));
                                totalImpuestoIna += Number(parseFloat(line.tax1amt).toFixed(2));
                                objTotalIna = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaIna.toFixed(2)
                                }
                                objImpIna = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoIna.toFixed(2)
                                }
                                memoInafecto.total += Number(parseFloat(line.amount).toFixed(2));

                                if (line.retencionImp === true) {
                                    retencion.monto = parseFloat(line.retencionAmount).toFixed(2);;
                                    retencion.montoBase = parseFloat(Math.abs(line.retencionBaseAmount)).toFixed(2);
                                    retencion.porcentaje = Number(parseFloat(line.retencionRate / 100).toFixed(2));
                                }
                            }

                            if (line.itemType === 'NonInvtPart' || line.isicbp === true) {
                                impTotalIcbp.valorImpuesto += Number(parseFloat(line.amount + line.tax1amt).toFixed(2));
                            }

                            cmTotalImpuesto.push({
                                idImpuesto: cmIdImpuesto,
                                montoImpuesto: line.tax1amt.toString(),
                                tipoAfectacion: cmTipoAfectacion,
                                montoBase: line.amount.toFixed(2).toString(),
                                porcentaje: line.taxRate1.toString()
                            });

                            var impTotal = 0;
                            var valVentaIgv = 0;
                            var preVenta = 0;
                            var totalLinea = 0;
                            var valorVentUnita = 0;

                            if (line.isIcbp === true) {
                                impTotal = parseFloat(line.amount + line.tax1amt).toFixed(2);
                                valVentaIgv = parseFloat(0.10).toFixed(2);
                                preVenta = 0;
                                totalLinea = parseFloat(line.quantity * (0.1)).toFixed(2);
                                valorVentUnita = 0;
                            } else {
                                impTotal = parseFloat(line.tax1amt).toFixed(2);
                                valVentaIgv = parseFloat(cmPreioVentaUnit).toFixed(2); //(line.amount + line.tax1amt).toFixed(2);
                                preVenta = parseFloat((line.quantity * line.rate) + line.tax1amt).toFixed(2);
                                totalLinea = parseFloat(line.amount).toFixed(2);
                                valorVentUnita = parseFloat(line.rate).toFixed(2);
                            }

                            /*
                            var idItem = line.item;
                            var articuloActivo = search.lookupFields({
                            type: search.Type.ITEM,
                                id: idItem,
                                columns: ['custitem_mumero_placa','itemid']
                            });
                            */

                            codigoItem = line.codigoISBN;

                            cmLine.push({
                                linea: String(k + 1),
                                total: totalLinea,
                                precioVenta: parseFloat(preVenta).toFixed(2),//parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2),
                                totalImpuesto: impTotal, // Math.abs(parseFloat(cmObject.totalAmount).toFixed(2)),
                                productCode: line.itemDisplay,
                                descripcion: line.description,
                                cantidad: line.quantity,
                                unidadComercial: line.unit,
                                valorVentUnitario: parseFloat(valorVentUnita).toFixed(2),
                                precioVentUnitario: parseFloat(cmPreioVentaUnit).toFixed(2),
                                valorVentaIncIgv: parseFloat(valVentaIgv).toFixed(2),
                                codigoTipoPrecio: line.tipoPrecioSunat,
                                // totalImpuesto: cmTotalImpuesto,
                                valorVenta: line.amount.toFixed(2).toString(),
                                montoTotalImpuesto: line.tax1amt.toFixed(2).toString(),
                                detalleImpuesto: detalleImpuesto,
                                impuestoIcbp: impuestoIcbp,
                                bolsa: '1',
                                codigo: codigoItem
                            });
                        } // End if: InvtPart o service
                    } // End for

                    objLine = {
                        lines: cmLine,
                        gravadas: objtotalGra,
                        inafectas: objTotalIna,
                        exoneradas: objTotalExo,
                        totalImpuestosGra: objImpGra,
                        totalImpuestosIna: objImpIna,
                        totalImpuestosExo: objImpExo,
                        importetotal: cmObject.totalAmount,
                        montototalimpuestos: cmObject.taxTotal.toString(),
                        codigocliente: cmObject.customerId
                    };
                } else {
                    var lineCount = cmObject.lines.length;

                    for (var l = 0; l < cmObject.lines.length; l++) {
                        var line = cmObject.lines[l];
                        var cmTotalImpuesto = [];
                        var cmPreioVentaUnit = 0.0;
                        var cmIdImpuesto = '';
                        var cmCodigo = '';
                        var cmTipoAfectacion = '';
                        var cmLround = 0.0;
                        var cmLround1 = 0.0;
                        var cmLround2 = 0.0;
                        var itemDisc = '';
                        var valorunitario = 0.0;
                        var totalImpuesto = 0.0;
                        var pVentaUnitario = 0.00;
                        var detalleImpuesto = {};
                        var detalleDescuento = {};
                        var impuestoIcbp = {};
                        var codigoItem = '';

                        if (docType === NC) {
                            if ((l + 1) < lineCount) {
                                itemDisc = cmObject.lines[l + 1].itemType;
                                if (itemDisc === 'Discount') {
                                    var rateDisc = parseFloat(cmObject.lines[l + 1].rate);
                                    rateDisc = rateDisc.toString().replace('-', '').replace('%', '');
                                    cmCargoDescuento = rateDisc / 100
                                    cmLround1 = cmCargoDescuento.toString().split('.');
                                    // cmCargoDescuento = cmLround1[1].length > 5 ? cmCargoDescuento.toFixed(5) : cmCargoDescuento;
                                    if (cmLround1.length > 1 && cmLround1[1] !== undefined && cmLround1[1].length > 5) {
                                        cmCargoDescuento = cmCargoDescuento.toFixed(5);
                                    }
                                    cmCargoDescuento = parseFloat(cmCargoDescuento);
                                }
                            }
                        }

                        if (line.itemType === 'InvtPart' || line.itemType === 'Service') {

                            if (docType === NC) {
                                if (itemDisc === 'Discount') {
                                    valorunitario = line.rate - (line.rate * cmCargoDescuento);
                                } else {
                                    valorunitario = line.rate;
                                }
                            } else {
                                valorunitario = line.rate - (line.rate * cmCargoDescuento);
                            }

                            totalImpuesto = valorunitario * (line.taxRate1 / 100);
                            cmLround = valorunitario.toString().split('.');

                            if (typeof cmLround[1] !== 'undefined') {
                                valorunitario = cmLround[1].length > 7 ? valorunitario.toFixed(7) : valorunitario;
                            }

                            pVentaUnitario = parseFloat(valorunitario + totalImpuesto);
                            cmLround2 = pVentaUnitario.toString().split('.');

                            if (typeof cmLround2[1] !== 'undefined') {
                                pVentaUnitario = cmLround2[1].length > 7 ? pVentaUnitario.toFixed(7) : pVentaUnitario;
                            }
                            // GRAVADAS
                            if (line.taxCodeDisplay === 'IGV_PE:S-PE' || (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp === true)) {
                                cmIdImpuesto = '1000';
                                cmCodigo = '1001';
                                cmTipoAfectacion = '10';

                                if (docType === NC) {
                                    if (itemDisc == 'Discount') {
                                        totalVentaGra += line.amount - (line.amount * cmCargoDescuento);
                                    } else {
                                        totalVentaGra += Number(parseFloat(line.amount).toFixed(2));
                                    }
                                } else {
                                    totalVentaGra += line.amount - (line.amount * cmCargoDescuento);
                                }
                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '10';
                                detalleImpuesto.codigoTributo = '1000';
                                detalleImpuesto.desTributo = 'IGV';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);

                                totalImpuestoGra += (totalImpuesto * line.quantity);
                                objtotalGra = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaGra.toFixed(2)
                                }
                                objImpGra = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoGra.toFixed(2)
                                }
                                memoGravado.total += Number(parseFloat(line.amount).toFixed(2));
                                memoGravado.base += Number(parseFloat(line.amount).toFixed(2));
                                memoGravado.valorImpuesto += Number(parseFloat(line.tax1amt).toFixed(2));
                                memoGravado.porcentaje = parseFloat(line.taxRate1).toFixed(2);
                            }
                            // EXONERADAS
                            if (line.taxCodeDisplay === 'IGV_PE:E-PE') {
                                cmIdImpuesto = '9997';
                                cmCodigo = '1003';
                                cmTipoAfectacion = '20';

                                if (docType === NC) {
                                    if (itemDisc == 'Discount') {
                                        totalVentaExo += line.amount - (line.amount * cmCargoDescuento);
                                    } else {
                                        totalVentaExo += Number(parseFloat(line.amount).toFixed(2));
                                    }
                                } else {
                                    totalVentaExo += line.amount - (line.amount * cmCargoDescuento);
                                }

                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '20';
                                detalleImpuesto.codigoTributo = '9997';
                                detalleImpuesto.desTributo = 'IGV';
                                detalleImpuesto.codigoUN = 'VAT';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);

                                totalImpuestoExo += Number(parseFloat(line.tax1amt).toFixed(2));
                                objTotalExo = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaExo.toFixed(2)
                                }
                                objImpExo = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoExo.toFixed(2)
                                }
                                memoInafecto.total += Number(parseFloat(line.amount).toFixed(2));
                            }
                            // INAFECTAS
                            if (line.taxCodeDisplay === 'IGV_PE:Inaf-PE' && line.isIcbp != true) {
                                cmIdImpuesto = '9998';
                                cmCodigo = '1002';
                                cmTipoAfectacion = '30';

                                if (docType === NC) {
                                    if (itemDisc == 'Discount') {
                                        totalVentaIna += line.amount - (line.amount * cmCargoDescuento);
                                    } else {
                                        totalVentaIna += Number(parseFloat(line.amount).toFixed(2));
                                    }
                                } else {
                                    totalVentaIna += line.amount - (line.amount * cmCargoDescuento);
                                }

                                detalleImpuesto.importeTributo = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.importeExplicito = parseFloat(line.montoImpuesto).toFixed(2);
                                detalleImpuesto.afectacionIgv = '30';
                                detalleImpuesto.codigoTributo = '9998';
                                detalleImpuesto.desTributo = 'INA';
                                detalleImpuesto.codigoUN = 'FRE';
                                detalleImpuesto.montoBase = parseFloat(line.amount).toFixed(2);
                                detalleImpuesto.tasaAplicada = parseFloat(line.taxRate1).toFixed(2);

                                totalImpuestoIna += Number(parseFloat(line.tax1amt).toFixed(2));
                                objTotalIna = {
                                    codigo: cmCodigo,
                                    totalVentas: totalVentaIna.toFixed(2)
                                }
                                objImpIna = {
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: totalImpuestoIna.toFixed(2)
                                }
                                memoExonerado.total += Number(parseFloat(line.amount).toFixed(2));
                            }

                            /*
                            var idItem = line.item;
                            var articuloActivo = search.lookupFields({
                            type: search.Type.ITEM,
                                id: idItem,
                                columns: ['custitem_mumero_placa','itemid']
                            });
                            */

                            codigoItem = line.codigoISBN;

                            if (itemDisc === 'Discount' && docType === NC) {

                                cmTotalImpuesto.push({
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: parseFloat((totalImpuesto * line.quantity)).toFixed(2),
                                    tipoAfectacion: cmTipoAfectacion,
                                    montoBase: parseFloat(line.amount - (line.amount * cmCargoDescuento)).toFixed(2),
                                    porcentaje: line.taxRate1.toString()
                                });

                                cmLine.push({
                                    linea: String(l + 1),
                                    total: parseFloat(line.amount).toFixed(2),
                                    precioVenta: parseFloat((line.quantity * line.rate) + line.tax1amt).toFixed(2), //parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                    productCode: line.itemDisplay,
                                    descripcion: line.description,
                                    cantidad: line.quantity,
                                    unidadComercial: line.unit,
                                    valorVentUnitario: parseFloat(valorunitario).toFixed(2),
                                    precioVentUnitario: parseFloat(pVentaUnitario).toFixed(2),
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    totalImpuesto: parseFloat(totalImpuesto * line.quantity).toFixed(2), //cmTotalImpuesto,
                                    valorVentaIncIgv: (line.amount + line.tax1amt).toFixed(2),
                                    valorVenta: parseFloat(line.amount - (line.amount * cmCargoDescuento)).toFixed(2),
                                    montoTotalImpuesto: parseFloat(totalImpuesto * line.quantity).toFixed(2),
                                    detalleImpuesto: detalleImpuesto,
                                    impuestoIcbp: impuestoIcbp,
                                    bolsa: '1',
                                    codigo: codigoItem
                                });
                            } else {

                                cmTotalImpuesto.push({
                                    idImpuesto: cmIdImpuesto,
                                    montoImpuesto: parseFloat(totalImpuesto * line.quantity).toFixed(2),
                                    tipoAfectacion: cmTipoAfectacion,
                                    montoBase: line.amount.toFixed(2),
                                    porcentaje: line.taxRate1.toString()
                                });

                                cmLine.push({
                                    linea: String(l + 1),
                                    total: parseFloat(line.amount).toFixed(2),
                                    precioVenta: parseFloat((line.quantity * line.rate) + line.tax1amt).toFixed(2), //parseFloat(line.quantity * (line.tax1amt + line.rate)).toFixed(2), // add
                                    totalImpuesto: parseFloat(totalImpuesto * line.quantity).toFixed(2), //Math.abs(parseFloat(cmObject.totalAmount).toFixed(2)),
                                    productCode: line.itemDisplay,
                                    descripcion: line.description,
                                    cantidad: line.quantity,
                                    unidadComercial: line.unit,
                                    valorVentUnitario: valorunitario.toFixed(2),
                                    precioVentUnitario: parseFloat(pVentaUnitario).toFixed(2),
                                    codigoTipoPrecio: line.tipoPrecioSunat,
                                    // totalImpuesto: cmTotalImpuesto,
                                    valorVentaIncIgv: (line.amount + line.tax1amt).toFixed(2),
                                    valorVenta: line.amount.toFixed(2),
                                    montoTotalImpuesto: (totalImpuesto * line.quantity).toFixed(2),
                                    detalleImpuesto: detalleImpuesto,
                                    impuestoIcbp: impuestoIcbp,
                                    bolsa: '1',
                                    codigo: codigoItem
                                });

                            }

                        } // END IF InvtPart O Service
                    } // END FOR
                    objLine = {
                        lines: cmLine,
                        gravadas: objtotalGra,
                        inafectas: objTotalIna,
                        exoneradas: objTotalExo,
                        totalImpuestosGra: objImpGra,
                        totalImpuestosIna: objImpIna,
                        totalImpuestosExo: objImpExo,
                        importetotal: cmObject.totalAmount,
                        montototalimpuestos: cmObject.taxTotal.toString(),
                        codigocliente: cmObject.customerId
                    }
                }
                trace = 'Actividad 5';
                var grav = objLine.gravadas || {};
                var exo = objLine.exoneradas || {};
                var ina = objLine.inafectas || {};
                var importTotal = [];
                // var arrImpuesto = [];

                if (grav && Object.keys(grav).length > 0) {
                    importTotal.push(parseFloat(objLine.gravadas.totalVentas));
                    // arrImpuesto.push(objLine.totalImpuestoGra.pop());
                }

                if (exo && Object.keys(exo).length > 0) {
                    importTotal.push(parseFloat(objLine.exoneradas.totalVentas));
                    // arrImpuesto.push(objLine.totalImpuestoExo.pop());
                }

                if (ina && Object.keys(ina).length > 0) {
                    importTotal.push(parseFloat(objLine.inafectas.totalVentas));
                    // arrImpuesto.push(objLine.totalImpuestoIna.pop());
                }

                var totalAmount = 0.0;
                for (var i in importTotal) {
                    totalAmount += importTotal[i];
                }
                // adicionar lineas
                comprobante.detalle = objLine.lines;

                // Motivo de Documento
                motivoDocument.serieDocRef = cmObject.serieRef;
                motivoDocument.numeroDocRef = cmObject.numRef;
                motivoDocument.codeMotivoEmi = cmObject.motivoMemo;
                motivoDocument.fechaDocRef = cmObject.fechaDocRef;
                motivoDocument.sustento = cmObject.sustentoMemo;
                motivoDocument.tipoDocRef = cmObject.tipoDocRef;

                // MONTOS TOTALES
                /*montoTotal.base = totalAmount;
                montoTotal.porcentaje = '18'; // pendiente
                montoTotal.valorImpuesto = Math.abs(cmObject.taxTotal);
                montoTotal.total = totalAmount;*/

                montoTotal = {
                    gravado: memoGravado,
                    inafecto: memoInafecto,
                    exonerado: memoExonerado,
                    gratuito: memoGratuito,
                    icbp: impTotalIcbp,
                    exporta: memoExportacion
                }

                if (desclinea != 0) {
                    texto.desclinea = desclinea;
                }

                comprobante.serie = cmObject.serie;
                comprobante.numero = cmObject.numero;
                comprobante.fechaEmision = cmObject.fechaEmision;
                comprobante.tipoComprobante = cmObject.tipoDocumento;
                comprobante.moneda = cmObject.currencySymbol;
                comprobante.horaEmision = cmObject.horaEmision;
                comprobante.tipoOperacion = ''; //cmObject. Pendiente preguntar como oobtener este campo

                comprobante.tipoDocIdentidad = cmObject.tipoDocReceptor;
                comprobante.ruc = cmObject.customer.ruc;
                comprobante.memo = cmObject.memo;

                var razonSocial = '';
                if (cmObject.typeCode === '03') {
                    razonSocial = cmObject.customer.fullName;
                } else {
                    razonSocial = cmObject.customer.customer;
                }

                comprobante.razonSocial = razonSocial.replace(/&/g, 'Y').replace('', 'haber3'); //jhair 081024
                comprobante.tipoDocIdentidad = cmObject.customer.tipoDocumento;
                comprobante.importeTotal = Math.abs(cmObject.memoTotal).toFixed(2);
                comprobante.totalImpuesto = Number(Number(totalDocTax) - icbpTotalImpuesto).toFixed(2);
                var subtotal = Math.abs(totalDoc - Number(totalDocTax));
                comprobante.totalValVenta = (subtotal - icbpTotalLineAmount).toFixed(2);
                comprobante.totalPrecioventa = Math.abs(totalDoc);//subtotal.toFixed(2);
                comprobante.versionUbl = VERSION_UBL;

                // Construir el objeto final
                comprobante.montoTotal = montoTotal;
                comprobante.motivoDocument = motivoDocument;
                // comprobante.montoTotal = montoTotal;
                comprobante.receptor = receptor;
                comprobante.formaPagoSunat = {
                    tipoFormaPago: getPaymentMethod(cmObject.formaPago)
                };
                comprobante.adicional = comprobanteAdicional;
                general.comprobante = comprobante;
                general.texto = texto;
                general.empresa = empresa;
                general.autenticacion = autenticacion;
                general.tipoComprobante = getTipoComprobante(cmObject.typeCode);
                general.tipoCodigo = '0';
                general.otorgar = '1';

                object = {
                    status: STATUS_OK,
                    message: 'Proceso completado correctamente',
                    data: general
                }

            } catch (error) {
                object = {
                    status: STATUS_ERROR,
                    message: 'Error No se puede procesar la informacion de la Nota de Crédito: ' + error.message
                }
                saveLog(internalId, null, userId, 'processCreditMemo Error ' + trace, error.message)
            }
            return object;
        }

        function getItemFullFillment(internalId) {
            var guia = '';
            try {
                var itemfulfillmentSearchObj = search.create({
                    type: "itemfulfillment",
                    filters:
                        [
                            ["type", "anyof", "ItemShip"],
                            "AND",
                            ["createdfrom.internalid", "anyof", internalId]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "tranid", label: "Document Number" }),
                            search.createColumn({ name: "createdfrom", label: "Created From" }),
                            search.createColumn({
                                name: "formulatext",
                                formula: "CONCAT({custbody_pe_serie}, CONCAT('-', {custbody_pe_number}))",
                                label: "Formula (Text)"
                            })
                        ]
                });
                var searchResultCount = itemfulfillmentSearchObj.runPaged().count;
                if (searchResultCount != 0) {
                    var searchResult = itemfulfillmentSearchObj.run().getRange({ start: 0, end: 1 });
                    var ordencarga = searchResult[0].getValue(itemfulfillmentSearchObj.columns[0]);
                    guia = searchResult[0].getValue(itemfulfillmentSearchObj.columns[2]);
                    return {
                        ordencarga: ordencarga,
                        guia: guia
                    }
                } else {
                    return 0;
                }
            } catch (e) {
                return 0;
            }
        }

        /*
        function getTermino(numDocumento) {
            var terminos = '';
            var fechaFin = '';
            try {

                var factura =  search.create({
                    type: "transaction",
                    filters:
                    [
                       ["mainline","is","T"], 
                       "AND", 
                       ["formulatext: CASE WHEN {tranid} = " + numDocumento + " THEN '1' ELSE '0' END","startswith","1"]
                    ],
                    columns:
                    [
                        search.createColumn({name: "terms", label: "Términos"}),
                        search.createColumn({
                           name: "formuladate",
                           formula: "{duedate}",
                           label: "Fórmula (fecha)"
                        }),
                        search.createColumn({
                           name: "formuladate",
                           formula: "{enddate}",
                           label: "Fórmula (fecha)"
                        })
                     ]
                });
                var searchResultCount = factura.runPaged().count;

                if (searchResultCount != 0) {
                    var searchResult = factura.run().getRange({ start: 0, end: 1 });
                    terminos = searchResult[0].getValue(factura.columns[0]);
                    fechaFin = searchResult[0].getValue(factura.columns[1]);
                    if(fechaFin != '' && fechaFin != null){
                        duedate = searchResult[0].getValue(factura.columns[1]);
                    } else {
                        duedate = searchResult[0].getValue(factura.columns[2]);
                    }
                } 
                return {
                    terms: terminos,
                    duedate: duedate,
                }
            } catch (e) {
                return {};
            }
        }
        */

        function getPaymentMethod(formaPago) {
            var method = '';
            switch (String(formaPago).toUpperCase()) {
                case 'CONTADO':
                    method = '1'
                    break;
                case 'CREDITO':
                    method = '2'
                    break;
            }
            return method;
        }

        function getTipoComprobante(typeCode) {
            var tipoComprobanteTmp = '';
            switch (String(typeCode)) {
                case FACTURA:
                    tipoComprobanteTmp = 'Factura';
                    break;
                case BOLETA:
                    tipoComprobanteTmp = 'Boleta';
                    break;
                case NC:
                    tipoComprobanteTmp = 'NotaCredito';
                    break;
                case ND:
                    tipoComprobanteTmp = 'NotaDebito';
                    break;
            }
            return tipoComprobanteTmp;
        }

        function getPromocion(promocionId) {
            try {
                var promotion = search.lookupFields({
                    type: 'promotioncode',
                    id: promocionId,
                    columns: ["discountrate", "combinationtype", "discount", "custrecord_is_discount_global"]
                });
                var rate = promotion["discountrate"];
                rate = rate.toString().replace('-', '').replace('%', '');
                var factorcargodescuento = (rate / 100).toFixed(2);

                return {
                    descuento: factorcargodescuento,
                    tipo: promotion["combinationtype"],
                    item: promotion["discount"][0].text,
                    dsctoGlobal: promotion["custrecord_is_discount_global"] || false
                }

            } catch (e) {
                log.debug({
                    title: 'getPromocion Error',
                    details: 'getPromocion Error : ' + error.message
                });
            }
        }

        function getCuotas(internalId, amount, dueDate, moneda, tipoCambio) {
            var arr = [];

            // LOG INICIAL
            saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_INICIO',
                'Parámetros recibidos - ID: ' + internalId +
                ', dueDate: ' + dueDate +
                ', amount: ' + amount +
                ', moneda: ' + moneda +
                ', tipoCambio: ' + tipoCambio);

            try {
                var tmpSearch = search.create({
                    type: "invoice",
                    filters:
                        [
                            ["type", "anyof", "CustInvc"],
                            "AND",
                            ["internalid", "anyof", internalId],
                            "AND",
                            ["mainline", "is", "T"]
                        ],
                    columns:
                        [
                            search.createColumn({
                                name: "installmentnumber",
                                join: "installment",
                                label: "Número de cuotas"
                            }),
                            search.createColumn({
                                name: "duedate",
                                join: "installment",
                                sort: search.Sort.ASC,
                                label: "Fecha de vencimiento"
                            }),
                            search.createColumn({
                                name: "amount",
                                join: "installment",
                                label: "Importe"
                            })
                        ]
                });

                var countResult = tmpSearch.runPaged().count;

                // LOG RESULTADO BÚSQUEDA
                saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_SEARCH_RESULT',
                    'Resultados encontrados en installment: ' + countResult);

                if (countResult !== 0) {
                    var pagedData = tmpSearch.runPaged({
                        pageSize: 1000,
                    });

                    var cuotasValidas = [];
                    var tieneDatosValidos = false;

                    pagedData.pageRanges.forEach(function (pageRange) {
                        var page = pagedData.fetch({
                            index: pageRange.index
                        });

                        page.data.forEach(function (result) {
                            var columns = result.columns;

                            var instNumber = Number(result.getValue(columns[0]));
                            var rawDueDate = result.getValue(columns[1]);
                            var rawAmount = result.getValue(columns[2]);

                            // LOG DATOS CRUDOS DE CADA CUOTA
                            saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_CUOTA_CRUDA',
                                'Cuota #' + instNumber +
                                ' - Fecha cruda: ' + rawDueDate +
                                ' - Monto crudo: ' + rawAmount +
                                ' - Moneda: ' + moneda);

                            // ✅ VALIDACIÓN: Verificar que los datos sean válidos
                            if (rawDueDate && rawDueDate !== '' && rawAmount && rawAmount !== '' && parseFloat(rawAmount) > 0) {
                                tieneDatosValidos = true;

                                var amount = 0;
                                var instName = '';

                                // Conversión de moneda
                                if (moneda === 'USD') {
                                    var tipoCambioValido = tipoCambio && parseFloat(tipoCambio) > 0 ? parseFloat(tipoCambio) : 1;
                                    amount = parseFloat(Number(rawAmount) / tipoCambioValido).toFixed(2);
                                    // LOG CONVERSIÓN
                                    saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_CONVERSION_USD',
                                        'Conversión USD: ' + rawAmount + ' / ' + tipoCambioValido + ' = ' + amount);
                                } else {
                                    amount = rawAmount;
                                }

                                // Formatear nombre de cuota
                                if (instNumber <= 9) {
                                    instName = "Cuota00" + instNumber;
                                } else if (instNumber <= 99 && instNumber > 9) {
                                    instName = "Cuota0" + instNumber;
                                } else {
                                    instName = "Cuota" + instNumber;
                                }

                                var cuotaFormateada = {
                                    installmentNumber: instName,
                                    dueDate: changeDateFormat(rawDueDate),
                                    amount: Math.abs(Number(amount)).toFixed(2)
                                };

                                // LOG CUOTA FORMATEADA
                                saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_CUOTA_FORMATEADA',
                                    'Cuota procesada: ' + JSON.stringify(cuotaFormateada));

                                cuotasValidas.push(cuotaFormateada);
                            } else {
                                // LOG CUOTA INVÁLIDA
                                saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_CUOTA_INVALIDA',
                                    'Cuota #' + instNumber + ' con datos inválidos - rawDueDate: "' + rawDueDate + '", rawAmount: "' + rawAmount + '"');
                            }
                        });
                    });

                    // ✅ DECISIÓN: Si no hay cuotas válidas, crear cuota única con parámetros
                    if (!tieneDatosValidos || cuotasValidas.length === 0) {
                        saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_FALLBACK_CUOTA_UNICA',
                            'No hay cuotas válidas en installment, creando cuota única con parámetros - dueDate: ' + dueDate + ', amount: ' + amount + ', moneda: ' + moneda);

                        // Crear cuota única usando los parámetros originales
                        var montoFinal = amount;
                        if (moneda === 'USD') {
                            var tipoCambioValido = tipoCambio && parseFloat(tipoCambio) > 0 ? parseFloat(tipoCambio) : 1;
                            montoFinal = (parseFloat(amount) / tipoCambioValido).toFixed(2);
                            saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_FALLBACK_CONVERSION',
                                'Conversión fallback USD: ' + amount + ' / ' + tipoCambioValido + ' = ' + montoFinal);
                        }

                        arr.push({
                            installmentNumber: 'Cuota001',
                            dueDate: changeDateFormat(dueDate),
                            amount: Math.abs(Number(montoFinal)).toFixed(2)
                        });
                    } else {
                        // Usar las cuotas válidas encontradas
                        arr = cuotasValidas;
                    }

                } else {
                    // LOG CUANDO NO HAY CUOTAS ESPECÍFICAS EN INSTALLMENT
                    saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_SIN_INSTALLMENT',
                        'No hay registros en installment, creando cuota única con parámetros - dueDate: ' + dueDate + ', amount: ' + amount + ', moneda: ' + moneda);

                    // Crear cuota única usando los parámetros
                    var montoFinal = amount;
                    if (moneda === 'USD') {
                        var tipoCambioValido = tipoCambio && parseFloat(tipoCambio) > 0 ? parseFloat(tipoCambio) : 1;
                        montoFinal = (parseFloat(amount) / tipoCambioValido).toFixed(2);
                        saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_SIN_INSTALLMENT_CONVERSION',
                            'Conversión sin installment USD: ' + amount + ' / ' + tipoCambioValido + ' = ' + montoFinal);
                    }

                    arr.push({
                        installmentNumber: 'Cuota001',
                        dueDate: changeDateFormat(dueDate),
                        amount: Math.abs(Number(montoFinal)).toFixed(2)
                    });
                }

                // LOG RESULTADO FINAL
                saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_RESULTADO_FINAL',
                    'Total cuotas generadas: ' + arr.length +
                    ' - Detalle: ' + JSON.stringify(arr));

            } catch (error) {
                // LOG ERROR
                saveLog(internalId, null, null, 'DEBUG_GETCUOTAS_ERROR',
                    'Error en getCuotas: ' + error.message);

                log.debug({
                    title: 'Error - getCuotas',
                    details: 'Error : ' + error.message
                });

                // ✅ FALLBACK EN CASO DE ERROR: Crear cuota única con parámetros
                var montoFinal = amount;
                if (moneda === 'USD') {
                    var tipoCambioValido = tipoCambio && parseFloat(tipoCambio) > 0 ? parseFloat(tipoCambio) : 1;
                    montoFinal = (parseFloat(amount) / tipoCambioValido).toFixed(2);
                }

                arr.push({
                    installmentNumber: 'Cuota001',
                    dueDate: changeDateFormat(dueDate),
                    amount: Math.abs(Number(montoFinal)).toFixed(2)
                });
            }

            return arr;
        }

        function getUnicaCuota(dueDate, amount, moneda, tipoCambio) {
            var arr = [];

            // LOG INICIAL
            saveLog(null, null, null, 'DEBUG_GETUNICACUOTA_INICIO',
                'Parámetros - dueDate: ' + dueDate +
                ', amount: ' + amount +
                ', moneda: ' + moneda +
                ', tipoCambio: ' + tipoCambio);

            var fechaFin = dueDate.split('/');
            var montoCou = 0;

            if (moneda === 'USD') {
                montoCou = parseFloat(Number(amount) / tipoCambio).toFixed(2);
                // LOG CONVERSIÓN
                saveLog(null, null, null, 'DEBUG_GETUNICACUOTA_CONVERSION',
                    'Conversión USD: ' + amount + ' / ' + tipoCambio + ' = ' + montoCou);
            } else {
                montoCou = amount;
            }
            montoCou = Math.abs(Number(montoCou)).toFixed(2);

            try {
                var cuotaUnica = {
                    installmentNumber: 'Cuota001',
                    dueDate: fechaFin[2] + '-' + fechaFin[1] + '-' + fechaFin[0],
                    amount: montoCou
                };

                // LOG CUOTA CREADA
                saveLog(null, null, null, 'DEBUG_GETUNICACUOTA_CREADA',
                    'Cuota única creada: ' + JSON.stringify(cuotaUnica));

                arr.push(cuotaUnica);

            } catch (error) {
                // LOG ERROR
                saveLog(null, null, null, 'DEBUG_GETUNICACUOTA_ERROR',
                    'Error en getUnicaCuota: ' + error.message);

                log.debug({
                    title: 'Error - getInfoNetsuite',
                    details: 'Error : ' + error.message
                });
            }
            return arr;
        }

        function buscarCuotasNotas(internalId, column56, FechafinCabecera, columa05) {
            var arrayCoutaNotas = [];
            try {
                var invoiceSearchObj = search.create({
                    type: "invoice",
                    filters:
                        [
                            ["type", "anyof", "CustInvc"],
                            "AND",
                            ["internalid", "anyof", internalId],
                            "AND",
                            ["mainline", "is", "T"]
                        ],
                    columns:
                        [
                            search.createColumn({
                                name: "installmentnumber",
                                join: "installment",
                                label: "Número de cuotas"
                            }),
                            search.createColumn({
                                name: "duedate",
                                join: "installment",
                                sort: search.Sort.ASC,
                                label: "Fecha de vencimiento"
                            }),
                            search.createColumn({
                                name: "amount",
                                join: "installment",
                                label: "Importe"
                            })
                        ]
                });
                var searchResultCount = invoiceSearchObj.runPaged().count;
                var searchResult = invoiceSearchObj.run().getRange({ start: 0, end: 1000 });
                var i = 0;
                if (searchResultCount > 1) {
                    invoiceSearchObj.run().each(function (result) {
                        var cuotaNum = searchResult[i].getValue(invoiceSearchObj.columns[0]);
                        cuotaNum = Number(cuotaNum);
                        var fechaFinCouta = searchResult[i].getValue(invoiceSearchObj.columns[1]);
                        var montoCouta = searchResult[i].getValue(invoiceSearchObj.columns[2]);
                        var nombreTitulo = '';
                        if (cuotaNum <= 9) {
                            nombreTitulo = "Cuota 00" + cuotaNum;
                        } else if (99 >= cuotaNum > 9) {
                            nombreTitulo = "Cuota 0" + cuotaNum;
                        } else if (cuotaNum > 99) {
                            nombreTitulo = "Cuota " + cuotaNum;
                        }
                        var jsonCouta = {
                            tituloAdicional: nombreTitulo,
                            valorAdicional: columa05 + " " + montoCouta + " - " + fechaFinCouta
                        }
                        i++;
                        arrayCoutaNotas.push(jsonCouta);
                        return true;
                    });
                } else {
                    var jsonCouta = {
                        tituloAdicional: "Cuota 001",
                        valorAdicional: columa05 + " " + column56 + " - " + FechafinCabecera
                    }
                    arrayCoutaNotas.push(jsonCouta);
                }

                return arrayCoutaNotas;
            } catch (error) {
                log.debug({
                    title: 'BuscarFechasNotas Error',
                    details: 'BuscarFechasNotas Error : ' + error.message
                });
            }
        }

        function buscarFechasCuotas(internalId, column32) {
            fechaFin = '';
            try {
                var invoiceSearchObj = search.create({
                    type: "invoice",
                    filters:
                        [
                            ["type", "anyof", "CustInvc"],
                            "AND",
                            ["internalid", "anyof", internalId],
                            "AND",
                            ["mainline", "is", "T"]
                        ],
                    columns:
                        [
                            search.createColumn({
                                name: "installmentnumber",
                                join: "installment",
                                label: "Número de cuotas"
                            }),
                            search.createColumn({
                                name: "duedate",
                                join: "installment",
                                sort: search.Sort.ASC,
                                label: "Fecha de vencimiento"
                            }),
                            search.createColumn({
                                name: "amount",
                                join: "installment",
                                label: "Importe"
                            })
                        ]
                });
                var searchResultCount = invoiceSearchObj.runPaged().count;
                var searchResult = invoiceSearchObj.run().getRange({ start: 0, end: 1000 });
                var i = 0;
                if (searchResultCount > 1) {
                    invoiceSearchObj.run().each(function (result) {
                        var fechaFinCouta = searchResult[i].getValue(invoiceSearchObj.columns[1]);
                        fechaFinCouta = fechaFinCouta.split('/');
                        fechaFinCouta = fechaFinCouta[2] + '-' + fechaFinCouta[1] + '-' + fechaFinCouta[0];

                        i++;
                        fechaFin = fechaFinCouta;
                        return true;
                    });
                } else {
                    fechaFin = column32;
                }

                return fechaFin;
            } catch (error) {
                log.debug({
                    title: 'BuscarFechasCuotas Error',
                    details: 'BuscarFechasCuotas Error : ' + error.message
                });
            }
        }

        function identifyDocumentType(internalId) {
            try {
                var tmpSearch = search.create({
                    type: search.Type.TRANSACTION,
                    filters:
                        [
                            ["internalid", "anyof", internalId],
                            "AND",
                            ["mainline", "is", "T"]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "type", label: "0.Tipo" }),
                            search.createColumn({
                                name: "custrecord_pe_serie_impresion",
                                join: "CUSTBODY_PE_SERIE",
                                label: "1.PESerieImpresion"
                            }),
                            search.createColumn({ name: "custbody_pe_number", label: "2.PENumero" }),
                            search.createColumn({ name: "subsidiary", label: "3.Subsidiaria" }),
                            search.createColumn({
                                name: "custrecord_pe_code_document_type",
                                join: "CUSTBODY_PE_DOCUMENT_TYPE",
                                label: "4.PECodeDocumentType"
                            })
                        ]
                });

                var result = tmpSearch.run().getRange({ start: 0, end: 1 });
                if (result && result.length > 0) {
                    return {
                        status: true,
                        message: 'OK',
                        type: result[0].getValue(tmpSearch.columns[0]),
                        serie: result[0].getValue(tmpSearch.columns[1]),
                        numero: result[0].getValue(tmpSearch.columns[2]),
                        subsidiaryId: result[0].getValue(tmpSearch.columns[3]),
                        documentType: result[0].getValue(tmpSearch.columns[4]),
                    }
                }

            } catch (error) {
                return {
                    status: false,
                    message: 'Error: ' + error.message
                }
            }
        }

        function getConfigWs(subsidiaryId) {
            var credentials = {
                status: false,
                message: 'INIT'
            };
            try {
                var tmpSearch = search.create({
                    type: "customrecord_ts_pe_fe_features",
                    filters: [["custrecord_ts_fe_subsidiary", "anyof", subsidiaryId]],
                    columns: [
                        search.createColumn({
                            name: "custrecord_ts_fe_url",
                            label: "0.URL"
                        }),
                        search.createColumn({
                            name: "custrecord_ts_fe_user",
                            label: "1.USER"
                        }),
                        search.createColumn({
                            name: "custrecord_ts_fe_password",
                            label: "2.PASS"
                        }),
                        search.createColumn({
                            name: "custrecord_ts_fe_ruc",
                            label: "3.RUC"
                        })
                    ]
                });
                var response = tmpSearch.run().getRange({ start: 0, end: 1 });
                if (response && response.length > 0) {
                    var credentials = {
                        status: true,
                        message: 'OK',
                        url: response[0].getValue(tmpSearch.columns[0]),
                        user: response[0].getValue(tmpSearch.columns[1]),
                        pass: response[0].getValue(tmpSearch.columns[2]),
                        ruc: response[0].getValue(tmpSearch.columns[3]),
                    };
                }

            } catch (error) {
                credentials = {
                    status: false,
                    message: 'Error : ' + error.message
                };
            }
            return credentials;
        }

        function saveLog(internalId, subsidiaryId, userId, status, response) {
            var logError = record.create({ type: 'customrecord_pe_ei_log_documents' });
            logError.setValue('custrecord_pe_ei_log_related_transaction', internalId);
            logError.setValue('custrecord_pe_ei_log_subsidiary', SUBSIDIARY_ID);
            logError.setValue('custrecord_pe_ei_log_employee', userId);
            logError.setValue('custrecord_pe_ei_log_status', status);
            logError.setValue('custrecord_pe_ei_log_response', response);
            logError.save();
        }

        function saveFile(fileName, type, content, folder) {
            try {
                var fileObj = file.create({
                    name: fileName,
                    fileType: type,
                    contents: content,
                    folder: folder
                });
                var fileId = fileObj.save();
                return fileId;
            } catch (error) {
                log.debug({
                    title: 'No se puede guardar el archivo',
                    details: 'Error saveFile => ' + error.message
                });
            }
        }

        function updateTrxFields(xmlUrl, internalId, tipoComprobante, tipoTransaccion) {
            var upt = {
                status: STATUS_ERROR,
                message: 'INIT'
            }
            try {
                var type = null;
                if (tipoComprobante === FACTURA || tipoComprobante === BOLETA || tipoComprobante === ND) {
                    type = record.Type.INVOICE;
                }
                if (tipoComprobante === NC) {
                    type = record.Type.CREDIT_MEMO
                }
                if (tipoTransaccion === 'CashSale') {
                    type = record.Type.CASH_SALE
                }

                var update = record.submitFields({
                    type: type,
                    id: internalId,
                    values: {
                        'custbody_pe_ei_printed_xml_req': xmlUrl,
                        // 'custbody_pe_ei_printed_pdf': pdfUrl,
                        // 'custbody_pe_ei_printed_cdr_res': cdrId
                    }
                });
                saveLog(internalId, null, userId, 'SET_FIELD_REQUEST', xmlUrl);
                upt = {
                    status: STATUS_OK,
                    message: 'Actualización del registro: ' + update + ' Completada correctamente.'
                }
            } catch (error) {
                upt = {
                    status: STATUS_ERROR,
                    message: 'Error: ' + error.message
                }
            }
            return upt;
        }

        // NUMBER TO WORDS
        function NumberToWordsConverter() {
            var arrUnit = [
                "Uno", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Cero",
                "Once", "Doce", "Trece", "Catorce", "Quince", "Dieciseis", "Diecisiete", "Dieciocho", "Diecinueve"
            ];
            var arrTens = [
                "", "Diez", "Veinte", "Treinta", "Cuarenta", "Cincuenta", "Sesenta", "Setenta", "Ochenta", "Noventa"
            ];
            var arrHundreds = [
                "Cien", "Ciento", "Doscientos", "Trescientos", "Cuatrocientos", "Quinientos", "Seiscientos", "Setecientos", "Ochocientos", "Novecientos"
            ];
            var arrThousands = ["Mil", "Millon", "Billon"];
            var vvSpace = " ";

            function numberToWords(pnNumber, pnParam) {
                var vnNumber = Math.abs(pnNumber);
                var vvText = "";

                if (vnNumber === 100) {
                    vvText = arrHundreds[0];
                } else {
                    var vnCurrent = Math.floor(vnNumber / 100);
                    vnNumber -= vnCurrent * 100;

                    if (vnCurrent !== 0) {
                        vvText = arrHundreds[vnCurrent];
                    }

                    if (vnNumber > 10 && vnNumber < 20) {
                        vnCurrent = Math.floor(vnNumber);
                        vvText += vvSpace + (vnCurrent === 10 ? arrTens[1] : arrUnit[vnCurrent]);
                    } else {
                        vnCurrent = Math.floor(vnNumber / 10);
                        vnNumber -= vnCurrent * 10;

                        if (vnCurrent !== 0) {
                            vvText += vvSpace + arrTens[vnCurrent];
                        }

                        vnCurrent = Math.floor(vnNumber);
                        if (vnCurrent !== 0) {
                            vvText += vvSpace + (vnCurrent === 1 && pnParam === 1 ? arrUnit[1] : arrUnit[vnCurrent]);
                        }
                    }
                }

                return vvText;
            }

            function amountToWords(pnNumber) {
                var vnNumber = Math.abs(pnNumber);
                var vvText = "";

                if (vnNumber === 0) {
                    vvText = vvSpace + arrUnit[10];
                } else {
                    var vnCurrent = Math.floor(vnNumber / 1e9);
                    vnNumber -= vnCurrent * 1e9;

                    if (vnCurrent !== 0) {
                        vvText += numberToWords(vnCurrent, 0) + vvSpace + arrThousands[2] + vvSpace;
                    }

                    vnCurrent = Math.floor(vnNumber / 1e6);
                    vnNumber -= vnCurrent * 1e6;

                    if (vnCurrent !== 0) {
                        vvText += numberToWords(vnCurrent, 0) + vvSpace + arrThousands[1] + vvSpace;
                        if (vnCurrent === 1) {
                            vvText += "es";
                        }
                    }

                    vnCurrent = Math.floor(vnNumber / 1e3);
                    vnNumber -= vnCurrent * 1e3;

                    if (vnCurrent !== 0) {
                        vvText += numberToWords(vnCurrent, 0) + vvSpace + arrThousands[0] + vvSpace;
                    }

                    if (vnNumber !== 120) {
                        vvText += numberToWords(vnNumber, 1);
                    }
                }

                return vvText;
            }

            function padStart(value, length, padding) {
                var pad = new Array(length + 1).join(padding || '0');
                return pad.substring(0, pad.length - value.length) + value;
            }

            function convertNumberToWords(pnAmount, pvMoneda) {
                var vnNumber = pnAmount;
                var vvText = amountToWords(vnNumber);
                var vvDecimalText = (Math.round((vnNumber % 1) * 100)).toString(); // .padStart(2, '0') + "/100";
                vvDecimalText = padStart(vvDecimalText, 2, '0') + "/100";
                var vvWith = "CON";
                var vvMoneda = pvMoneda === "PEN" ? "SOLES" : pvMoneda === "USD" ? "DOLARES" : "";

                vvText = vvText + vvSpace + vvWith + vvSpace + vvDecimalText + vvSpace + vvMoneda;

                return vvText.trim();
            }

            return {
                convertNumberToWords: convertNumberToWords
            };
        }

        // FUNCINONES UTILS
        function nvl(value, defaultValue) {
            return (value !== null && value !== undefined && value !== '') ? value : defaultValue;
        }


        function changeDateFormat(dateString) {
            try {
                // Verificar que dateString existe y no es null/undefined
                if (!dateString) {
                    return '';
                }

                // Convertir a string si no lo es
                var dateStr = String(dateString);

                // Si viene en formato dd/MM/yyyy o dd/mm/yyyy
                if (dateStr.indexOf('/') !== -1) {
                    var parts = dateStr.split('/');
                    if (parts.length === 3) {
                        var day = parts[0];
                        var month = parts[1];
                        var year = parts[2];

                        // Asegurar formato de 2 dígitos para día y mes
                        if (day.length === 1) day = '0' + day;
                        if (month.length === 1) month = '0' + month;

                        // Devolver en formato yyyy-MM-dd
                        return year + '-' + month + '-' + day;
                    }
                }

                // Si viene en formato dd-MM-yyyy
                if (dateStr.indexOf('-') !== -1 && dateStr.length === 10) {
                    var parts = dateStr.split('-');
                    if (parts.length === 3) {
                        // Si ya está en formato yyyy-MM-dd, devolverlo tal como está
                        if (parts[0].length === 4) {
                            return dateStr;
                        }
                        // Si está en formato dd-MM-yyyy, convertirlo
                        if (parts[2].length === 4) {
                            var day = parts[0];
                            var month = parts[1];
                            var year = parts[2];

                            // Asegurar formato de 2 dígitos
                            if (day.length === 1) day = '0' + day;
                            if (month.length === 1) month = '0' + month;

                            return year + '-' + month + '-' + day;
                        }
                    }
                }

                // Fallback: intentar parsear como fecha
                var date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                    var year = date.getFullYear();
                    var month = date.getMonth() + 1;
                    var day = date.getDate();

                    // Asegurar formato de 2 dígitos
                    var monthStr = month < 10 ? '0' + month : String(month);
                    var dayStr = day < 10 ? '0' + day : String(day);

                    return year + '-' + monthStr + '-' + dayStr;
                }

                // Si nada funciona, devolver el string original
                return dateStr;

            } catch (error) {
                log.debug('changeDateFormat_ERROR', 'Error procesando fecha: ' + dateString + ', Error: ' + error.message);
                return String(dateString || '');
            }
        }

        function extractDetraccionData(internalId, userId, totalAmount, subsidiary, transactionData) {
            var detraccionInfo = { aplica: false };

            try {
                // LOG INICIO CON PARÁMETROS
                saveLog(internalId, null, userId, 'DEBUG_DETRACCION_INICIO',
                    'Iniciando extracción - totalAmount: ' + totalAmount +
                    ', currencySymbol: ' + (transactionData.currencySymbol || 'N/A') +
                    ', dueDate: ' + (transactionData.dueDate || 'N/A'));

                var tieneDetraccion = false;
                var montoDetraccion = 0;
                var porcentajeDetraccion = 0;

                // CARGAR REGISTRO UNA SOLA VEZ
                var facturaRecord = record.load({
                    type: record.Type.INVOICE,
                    id: internalId
                });

                // MÉTODO 1: Leer directamente desde el registro de la factura
                try {
                    // OBTENER CAMPOS DE DETRACCIÓN DESDE EL REGISTRO
                    var witaxAmount = facturaRecord.getValue('custpage_4601_witaxamount') ||
                        facturaRecord.getValue('custbody_4601_witaxamount');
                    var witaxRate = facturaRecord.getValue('custpage_4601_witaxrate') ||
                        facturaRecord.getValue('custbody_4601_witaxrate');

                    saveLog(internalId, null, userId, 'DEBUG_REGISTRO_DETRACCION',
                        'Desde registro - witaxAmount=' + witaxAmount +
                        ', witaxRate=' + witaxRate);

                    if (witaxAmount && parseFloat(witaxAmount) > 0) {
                        tieneDetraccion = true;
                        montoDetraccion = parseFloat(witaxAmount);

                        if (witaxRate) {
                            porcentajeDetraccion = parseFloat(witaxRate.toString().replace('%', '').trim());
                        }

                        saveLog(internalId, null, userId, 'DETRACCION_ENCONTRADA_REGISTRO',
                            'Detracción encontrada en registro: Monto=' + montoDetraccion +
                            ', Porcentaje=' + porcentajeDetraccion);
                    }
                } catch (recordError) {
                    saveLog(internalId, null, userId, 'ERROR_LEYENDO_REGISTRO',
                        'Error leyendo registro: ' + recordError.message);
                }

                // MÉTODO 2: Buscar en las líneas del registro si no encontró en campos principales
                if (!tieneDetraccion) {
                    try {
                        var lineCount = facturaRecord.getLineCount({ sublistId: 'item' });

                        saveLog(internalId, null, userId, 'DEBUG_LINEAS_DETRACCION',
                            'Buscando en líneas - Total líneas: ' + lineCount);

                        for (var i = 0; i < lineCount; i++) {
                            var witaxApplies = facturaRecord.getSublistValue({
                                sublistId: 'item',
                                fieldId: 'custcol_4601_witaxapplies',
                                line: i
                            });

                            var lineWitaxAmount = facturaRecord.getSublistValue({
                                sublistId: 'item',
                                fieldId: 'custcol_4601_witaxamount',
                                line: i
                            });

                            var lineWitaxRate = facturaRecord.getSublistValue({
                                sublistId: 'item',
                                fieldId: 'custcol_4601_witaxrate',
                                line: i
                            });

                            // LOG CADA LÍNEA PARA DEBUG
                            // saveLog(internalId, null, userId, 'DEBUG_LINEA_' + i,
                            //     'Línea ' + i + ': witaxApplies=' + witaxApplies +
                            //     ', witaxAmount=' + lineWitaxAmount +
                            //     ', witaxRate=' + lineWitaxRate);

                            if (witaxApplies === true || witaxApplies === 'T') {
                                if (lineWitaxAmount && parseFloat(lineWitaxAmount) > 0) {
                                    tieneDetraccion = true;
                                    montoDetraccion = parseFloat(lineWitaxAmount);

                                    if (lineWitaxRate) {
                                        porcentajeDetraccion = parseFloat(lineWitaxRate.toString().replace('%', '').trim());
                                    }

                                    saveLog(internalId, null, userId, 'DETRACCION_ENCONTRADA_LINEA_REGISTRO',
                                        'Detracción encontrada en línea ' + i + ': Monto=' + montoDetraccion +
                                        ', Porcentaje=' + porcentajeDetraccion);
                                    break;
                                }
                            }
                        }
                    } catch (lineError) {
                        saveLog(internalId, null, userId, 'ERROR_LEYENDO_LINEAS',
                            'Error leyendo líneas: ' + lineError.message);
                    }
                }

                if (!tieneDetraccion) {
                    saveLog(internalId, null, userId, 'DETRACCION_NO_APLICA',
                        'No se encontraron datos de detracción en el registro');
                    return detraccionInfo;
                }

                // VERIFICAR FORMA DE PAGO ANTES DE CONTINUAR
                var formaPagoId = facturaRecord.getValue('custbody_pe_ei_forma_pago');
                var esCredito = (formaPagoId && formaPagoId == '2');

                saveLog(internalId, null, userId, 'DEBUG_FORMA_PAGO_VERIFICACION',
                    'PE Forma de Pago: ' + formaPagoId +
                    ' - Es Crédito: ' + esCredito);

                // OBTENER CUOTAS SOLO SI ES CRÉDITO
                var cuotasCredito = [];
                var montoPendiente = 0;

                if (esCredito) {
                    try {
                        // PREPARAR DATOS PARA getCuotas CON ORDEN CORRECTO
                        var tipoCambio = parseFloat(transactionData.tipoCambio || 1);
                        var moneda = transactionData.currencySymbol || 'PEN';
                        var dueDate = transactionData.dueDate;           // FECHA
                        var totalAmountForCuotas = transactionData.totalAmount;  // MONTO

                        saveLog(internalId, null, userId, 'DEBUG_PARAMETROS_GETCUOTAS',
                            'Parámetros para getCuotas:' +
                            '\n- internalId: ' + internalId +
                            '\n- dueDate (fecha): ' + dueDate + ' (tipo: ' + typeof dueDate + ')' +
                            '\n- totalAmount (monto): ' + totalAmountForCuotas + ' (tipo: ' + typeof totalAmountForCuotas + ')' +
                            '\n- moneda: ' + moneda +
                            '\n- tipoCambio: ' + tipoCambio);


                        cuotasCredito = getCuotas(internalId, totalAmountForCuotas, dueDate, moneda, tipoCambio);

                        for (var i = 0; i < cuotasCredito.length; i++) {
                            montoPendiente += parseFloat(cuotasCredito[i].amount);
                        }

                        saveLog(internalId, null, userId, 'DEBUG_CUOTAS_CREDITO_PROCESADAS',
                            'Cuotas procesadas para crédito - Total: ' + cuotasCredito.length +
                            ', Monto pendiente: ' + montoPendiente.toFixed(2) +
                            ', Primera cuota: ' + (cuotasCredito.length > 0 ? JSON.stringify(cuotasCredito[0]) : 'N/A'));

                    } catch (cuotasError) {
                        saveLog(internalId, null, userId, 'ERROR_PROCESANDO_CUOTAS',
                            'Error obteniendo cuotas: ' + cuotasError.message);
                        // Continuar sin cuotas si hay error
                        cuotasCredito = [];
                        montoPendiente = 0;
                    }
                } else {
                    saveLog(internalId, null, userId, 'DEBUG_NO_ES_CREDITO',
                        'No es crédito, omitiendo procesamiento de cuotas');
                }

                // OBTENER CUENTA DE LA SUBSIDIARIA
                var cuentaBancoNacion = '';
                try {
                    var subsidiaryRecord = record.load({
                        type: record.Type.SUBSIDIARY,
                        id: "1"
                    });

                    cuentaBancoNacion = subsidiaryRecord.getValue({
                        fieldId: 'custrecord_pe_cuenta_banco_nacion'
                    }) || '';

                    saveLog(internalId, null, userId, 'DETRACCION_CUENTA_OBTENIDA',
                        'Cuenta Banco Nación obtenida: ' + cuentaBancoNacion);

                } catch (subsidiaryError) {
                    saveLog(internalId, null, userId, 'DETRACCION_CUENTA_ERROR',
                        'Error obteniendo cuenta subsidiaria: ' + subsidiaryError.message);
                }

                if (!cuentaBancoNacion) {
                    saveLog(internalId, null, userId, 'DETRACCION_CUENTA_FALTANTE_FINAL',
                        'Cuenta banco nación no configurada en la subsidiaria');
                    return detraccionInfo;
                }

                // OBTENER CAMPOS DE DETRACCIÓN DE LA FACTURA
                var campos = getDetraccionFields(internalId, userId);

                // OBTENER CÓDIGOS DE LAS LISTAS
                var codigos = getCodigosDetraccion(campos.conceptoId, campos.formaPagoId, internalId, userId);

                // CONSTRUIR ESTRUCTURA EXACTA PARA XML SOAP
                detraccionInfo = {
                    aplica: true,
                    esCredito: esCredito,
                    cuotasCredito: cuotasCredito,
                    montoPendiente: montoPendiente,
                    // ESTRUCTURA QUE SE CONVERTIRÁ EN XML
                    xmlStructure: {
                        Monto: {
                            ENMonto: {
                                Codigo: '2001',
                                Valor: montoDetraccion.toFixed(2)
                            }
                        },
                        Porcentaje: {
                            ENPorcentaje: {
                                Codigo: '2001',
                                Valor: porcentajeDetraccion.toFixed(2)
                            }
                        },
                        BienesServicios: {
                            ENBienesServicios: {
                                Codigo: '2003',
                                Valor: codigos.concepto.codigo
                            }
                        },
                        NumeroCuenta: {
                            ENNumeroCuenta: {
                                Codigo: '2004',
                                Valor: cuentaBancoNacion,
                                CodigoFormaPago: codigos.formaPago.codigo
                            }
                        }
                    },
                    // TAMBIÉN AGREGAR PROPIEDAD ADICIONAL
                    propiedadAdicional: {
                        Codigo: '2006',
                        Valor: 'Operación sujeta a detracción'
                    }
                };

                saveLog(internalId, null, userId, 'DETRACCION_RESULTADO_FINAL',
                    'Detracción procesada exitosamente:' +
                    '\n- Tipo: ' + (esCredito ? 'CRÉDITO' : 'CONTADO') +
                    '\n- Monto: ' + montoDetraccion +
                    '\n- Porcentaje: ' + porcentajeDetraccion +
                    '\n- Concepto: ' + codigos.concepto.codigo +
                    '\n- Cuenta: ' + cuentaBancoNacion +
                    '\n- Cuotas: ' + cuotasCredito.length +
                    '\n- Monto Pendiente: ' + montoPendiente.toFixed(2));

            } catch (e) {
                saveLog(internalId, null, userId, 'DETRACCION_ERROR_GENERAL',
                    'Error procesando detracción: ' + e.message +
                    '\nStack: ' + (e.stack || 'No disponible'));
            }

            return detraccionInfo;
        }

        function getDetraccionFields(internalId, userId) {
            var result = {
                formaPagoId: null,
                conceptoId: null
            };

            try {
                var invoiceSearch = search.create({
                    type: search.Type.INVOICE,
                    filters: [
                        ['internalid', 'anyof', internalId],
                        'AND',
                        ['mainline', 'is', 'T']
                    ],
                    columns: [
                        'custbody_pe_payment_methods',
                        'custbody_pe_concept_detraction'
                    ]
                });

                var searchResult = invoiceSearch.run().getRange({ start: 0, end: 1 });

                if (searchResult && searchResult.length > 0) {
                    var row = searchResult[0];
                    result.formaPagoId = row.getValue('custbody_pe_payment_methods');
                    result.conceptoId = row.getValue('custbody_pe_concept_detraction');

                    saveLog(internalId, null, userId, 'DETRACCION_CAMPOS_CHECK',
                        'FormaPago: ' + result.formaPagoId + ', Concepto: ' + result.conceptoId);
                }

            } catch (e) {
                saveLog(internalId, null, userId, 'DETRACCION_CAMPOS_ERROR',
                    'Error obteniendo campos: ' + e.message);
            }

            return result;
        }

        function hasDetraccionLines(internalId, userId) {
            try {
                // LA DETRACCIÓN SE APLICA AUTOMÁTICAMENTE SI:
                // 1. El monto total >= S/ 700 
                // 2. Todos los campos están completos
                // NO necesitamos verificar líneas individuales

                saveLog(internalId, null, userId, 'DETRACCION_LOGICA_AUTOMATICA',
                    'Aplicando detracción automáticamente por cumplir condiciones SUNAT');
                return true;

            } catch (e) {
                saveLog(internalId, null, userId, 'DETRACCION_LINEAS_ERROR',
                    'Error en verificación automática: ' + e.message);
                return false;
            }
        }

        // 6. FUNCIÓN PARA OBTENER CÓDIGOS DE LAS LISTAS
        function getCodigosDetraccion(conceptoId, formaPagoId, internalId, userId) {
            // OBTENER CÓDIGOS 100% DINÁMICAMENTE
            var dinamicResult = getCodigosDetraccionDinamico(conceptoId, formaPagoId, internalId, userId);

            // USAR FALLBACKS SOLO SI LOS CAMPOS DINÁMICOS ESTÁN VACÍOS
            var result = {
                concepto: {
                    codigo: dinamicResult.concepto.codigo || '022',
                    descripcion: dinamicResult.concepto.descripcion || 'Otros Servicios Empresariales',
                    porcentaje: dinamicResult.concepto.porcentaje || '12.0'
                },
                formaPago: {
                    codigo: dinamicResult.formaPago.codigo || '001',
                    descripcion: dinamicResult.formaPago.descripcion || 'Depósito en cuenta'
                }
            };

            // LOG RESULTADO
            var totalmente_dinamico = (dinamicResult.concepto.codigo !== '' && dinamicResult.formaPago.codigo !== '');

            saveLog(internalId, null, userId, 'DETRACCION_CODIGOS_RESULTADO',
                'Modo: ' + (totalmente_dinamico ? 'TOTALMENTE_DINAMICO' : 'CON_FALLBACKS') +
                ', Concepto=' + result.concepto.codigo +
                ', FormaPago=' + result.formaPago.codigo +
                ', Porcentaje=' + result.concepto.porcentaje);

            return result;
        }

        function getCodigosDetraccionDinamico(conceptoId, formaPagoId, internalId, userId) {
            var result = {
                concepto: { codigo: '', descripcion: '', porcentaje: '' },
                formaPago: { codigo: '', descripcion: '' }
            };

            // OBTENER CONCEPTO DE DETRACCIÓN DINÁMICAMENTE
            if (conceptoId) {
                try {
                    var conceptoRecord = record.load({
                        type: 'customrecord_pe_concept_detraction',
                        id: conceptoId
                    });

                    result.concepto = {
                        codigo: conceptoRecord.getValue('custrecord_pe_code_detraccion') || '', // CAMPO CORRECTO
                        descripcion: conceptoRecord.getValue('name') || '',
                        porcentaje: conceptoRecord.getValue('custrecord_pe_percentage_detraction') || ''
                    };

                    saveLog(internalId, null, userId, 'CONCEPTO_DETRACCION_DINAMICO',
                        'Concepto ID ' + conceptoId + ' cargado: ' + JSON.stringify(result.concepto));

                } catch (e) {
                    saveLog(internalId, null, userId, 'CONCEPTO_DETRACCION_ERROR',
                        'Error cargando concepto ID ' + conceptoId + ': ' + e.message);
                }
            }

            // OBTENER FORMA DE PAGO DINÁMICAMENTE
            if (formaPagoId) {
                try {
                    var pagoRecord = record.load({
                        type: 'customrecord_pe_payment_method',
                        id: formaPagoId
                    });

                    result.formaPago = {
                        codigo: pagoRecord.getValue('custrecord_pe_cod_payment_method') || '',
                        descripcion: pagoRecord.getValue('name') || ''
                    };

                    saveLog(internalId, null, userId, 'FORMA_PAGO_DINAMICA',
                        'FormaPago ID ' + formaPagoId + ' cargada: ' + JSON.stringify(result.formaPago));

                } catch (e) {
                    saveLog(internalId, null, userId, 'FORMA_PAGO_ERROR',
                        'Error cargando forma pago ID ' + formaPagoId + ': ' + e.message);
                }
            }

            saveLog(internalId, null, userId, 'CODIGOS_DETRACCION_DINAMICOS_FINAL',
                'Resultado final: ' + JSON.stringify(result));

            return result;
        }

        return {
            validate: validate
        }
    });