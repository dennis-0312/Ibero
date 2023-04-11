/********************************************************************************************************************************************************
This script for Item Fulfillment
/******************************************************************************************************************************************************** 
File Name: TS_ST_Print_PDF.js                                                                        
Commit: 01                                                        
Version: 1.0                                                                     
Date: 27/06/2022
ApiVersion: Script 2.x
Enviroment: SB
Governance points: N/A
========================================================================================================================================================*/
/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */


define(['N/ui/serverWidget', 'N/record', 'N/render', 'N/file', 'N/search', 'N/runtime'],

    function (serverWidget, record, render, file, search, runtime) {

        const REC_GUIA_REMISION = 'itemfulfillment'; //
        const SALES_ORDER = 'salesorder';
        const VENDOR_AUTORIZATION = 'vendorreturnauthorization';
        const TRANSFER_ORDER = 'transferorder';
        const BUSQ_GUIA_REMISION = 'ItemShip';
        const ID_LIST_CONDUCTOR_SEC = 'recmachcustrecord_pe_nmro_guia_remision_con_sec';
        const ID_LIST_VEHICULO_SEC = 'recmachcustrecord_pe_nmro_guia_remision_veh_sec';

        function onRequest(context) {
            try {
                var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
                log.debug('inicio', remainingUsage);

                if (context.request.method == 'GET') {
                    log.debug("INICIO", "INICIO");
                    var xmlJSON = {};
                    var id_template = '';
                    var typeEntity = '';
                    var fieldEntity = '';
                    var rec_id = context.request.parameters.custpage_internalid;
                    var type_doc = context.request.parameters.custpage_typerec;
                    var is_fel = context.request.parameters.custpage_fel;
                    var rec = record.load({ type: type_doc, id: rec_id });

                    if (type_doc == 'itemfulfillment') {

                        // INFORMACIÓN DE RECORD RELACIONADO
                        var idRecRel = rec.getValue('createdfrom');
                        var typeRef = search.lookupFields({
                            type: 'transaction',
                            id: idRecRel,
                            columns: ['recordtype']
                        });

                        var typeTransaction = typeRef['recordtype'];

                        if (typeTransaction == 'salesorder') {
                            typeEntity = 'customer';
                            fieldEntity = 'entity';
                            fieldvatregnum = 'vatregnumber';
                        } else if (typeTransaction == 'transferorder') {
                            typeEntity = 'employee';
                            fieldEntity = 'employee';
                            fieldvatregnum = 'custentity_pe_document_number';
                        } else if (typeTransaction == VENDOR_AUTORIZATION) {
                            typeEntity = 'vendor';
                            fieldEntity = 'entity';
                            fieldvatregnum = 'vatregnumber';
                        }

                        var recRel = record.load({ type: typeTransaction, id: idRecRel });

                        // INFORMACIÓN DEL CUSTOMER
                        var infoCustomer = record.load({
                            type: typeEntity,
                            id: recRel.getValue(fieldEntity),
                        });

                        // INFORMACIÓN DE LA SUBSIDIARIA
                        var recSubsidiaria = record.load({
                            type: 'subsidiary',
                            id: recRel.getValue('subsidiary')
                        });


                        // CONSTRUCCIÓN DE LA TRAMA PARA EL PDF New
                        xmlJSON.tranid = rec.getText('tranid');
                        xmlJSON.entity = (recRel.getText(fieldEntity)).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.vatregnum = (infoCustomer.getValue(fieldvatregnum)).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.trandate = rec.getText('trandate');
                        xmlJSON.duedate = recRel.getText('shipdate');
                        xmlJSON.shipaddress = (recRel.getText('shipaddress'));
                        xmlJSON.shipaddr1 = (infoCustomer.getValue('shipaddr1')).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.shipaddr2 = (infoCustomer.getValue('shipaddr2')).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.shipcity = (infoCustomer.getValue('shipcity')).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.customer_direccion = (infoCustomer.getValue('billaddr1')).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.customer_city = (infoCustomer.getValue('billcity')).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        xmlJSON.currencyname = recRel.getText('currencyname');
                        xmlJSON.quienrecibe = recRel.getText('custbody_il_quien_recibe');
                        xmlJSON.memo = (rec.getText('memo')).replace(/[^a-zA-Z 0-9.]+/g, ' ');

                        const tipoDocumento = infoCustomer.getText('custentity_pe_document_type');

                        xmlJSON.federalidnumber = recSubsidiaria.getValue('federalidnumber');
                        xmlJSON.legalname = (recSubsidiaria.getText('legalname')).replace(/&/g, '&amp;');
                        var address = (recSubsidiaria.getValue('mainaddress_text')).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                        var telefax = recSubsidiaria.getValue('fax');
                        var url = (recSubsidiaria.getValue('url')).replace(/&/g, '&amp;');
                        var arrayAddress = address.split('\r\n');
                        xmlJSON.addr1 = arrayAddress[1];
                        xmlJSON.addr2 = arrayAddress[2];
                        xmlJSON.addr3 = arrayAddress[2];
                        xmlJSON.email = recSubsidiaria.getValue('email');
                        xmlJSON.telefax = telefax;
                        xmlJSON.url = url;


                        // INFORMACIÓN RELACIONADA A FEL GUÍAS DE REMISIÓN

                        if (is_fel == 'true') {

                            id_template = './TS_FM_Itemfulfillment_fel.ftl';

                            var searchLoad = search.create({
                                type: "itemfulfillment",
                                filters:
                                    [
                                        ["type", "anyof", BUSQ_GUIA_REMISION],
                                        "AND",
                                        ["internalid", "anyof", rec_id]
                                    ],
                                columns:
                                    [
                                        search.createColumn({
                                            name: "formulatext",
                                            formula: "CONCAT({custbody_pe_serie}, CONCAT('-', {custbody_pe_number}))",
                                            label: "1.IDE_numeracion"
                                        }),
                                        search.createColumn({
                                            name: "formulatext",
                                            formula: "TO_CHAR({trandate},'YYYY-MM-DD')",
                                            label: "2.IDE_fechaEmision"
                                        }),
                                        search.createColumn({
                                            name: "formulatext",
                                            formula: "TO_CHAR({datecreated},'HH24:MI:SS')",
                                            label: "3.IDE_horaEmision"
                                        }),
                                        search.createColumn({
                                            name: "custrecord_pe_code_document_type",
                                            join: "CUSTBODY_PE_DOCUMENT_TYPE",
                                            label: "4.IDE_codTipoDocumento"
                                        }),
                                        search.createColumn({
                                            name: "formulanumeric",
                                            formula: "6",
                                            label: "5.EMI_tipoDocId"
                                        }),
                                        search.createColumn({
                                            name: "taxidnum",
                                            join: "subsidiary",
                                            label: "6.EMI_numeroDocId"
                                        }),
                                        search.createColumn({
                                            name: "name",
                                            join: "subsidiary",
                                            label: "7.EMI_nombreComercial"
                                        }),
                                        search.createColumn({
                                            name: "legalname",
                                            join: "subsidiary",
                                            label: "8.EMI_razonSocial"
                                        }),
                                        search.createColumn({
                                            name: "city",
                                            join: "subsidiary",
                                            label: "9.EMI_ubigeo"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "subsidiary",
                                            label: "10.EMI_direccion"
                                        }),
                                        search.createColumn({
                                            name: "state",
                                            join: "subsidiary",
                                            label: "11.EMI_codigoPais"
                                        }),
                                        search.createColumn({
                                            name: "phone",
                                            join: "subsidiary",
                                            label: "12.EMI_telefono"
                                        }),
                                        search.createColumn({
                                            name: "email",
                                            join: "subsidiary",
                                            label: "13.EMI_correoElectronico"
                                        }),
                                        search.createColumn({
                                            // name: "custentity_pe_document_type",
                                            // join: "customer",
                                            name: "formulatext",
                                            formula: "{customer.custentity_pe_document_type}",
                                            label: "14.DDE_tipoDocId_customer"
                                        }),
                                        search.createColumn({
                                            name: "vatregnumber",
                                            join: "customer",
                                            label: "15.DDE_numeroDocId_customer"
                                        }),
                                        search.createColumn({
                                            name: "companyname",
                                            join: "customer",
                                            label: "16.DDE_razonSocial_customer"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "customer",
                                            label: "17.DDE_direccion_customer"
                                        }),
                                        search.createColumn({
                                            name: "phone",
                                            join: "customer",
                                            label: "18.DDE_telefono_customer"
                                        }),
                                        search.createColumn({
                                            name: "email",
                                            join: "customer",
                                            label: "19.DDE_correoElectronico_customer"
                                        }),
                                        search.createColumn({
                                            // name: "custrecord_pe_codigo_motivo_traslado",
                                            // join: "CUSTBODY_PE_MOTIVO_TRASLADO",
                                            name: "custbody_pe_motivo_traslado",
                                            label: "20.GRC_motivoTraslado"
                                        }),
                                        search.createColumn({ name: "custbody_pe_motivo_traslado", label: "21.GRC_descripcionMotivoTraslado" }),
                                        search.createColumn({ name: "custbody_pe_peso_tn", label: "22.GRC_pesoBrutoBienes" }),
                                        search.createColumn({
                                            name: "custrecord_pe_code_measurement_unit",
                                            join: "CUSTBODY_PE_UNIDAD_MEDIDA_PB",
                                            label: "23.GRC_unidadMedidaPesoBruto"
                                        }),
                                        search.createColumn({
                                            // name: "custrecord_pe_cod_mod_traslado",
                                            // join: "CUSTBODY_PE_MODALIDAD_TRASLADO",
                                            name: "custbody_pe_modalidad_traslado",
                                            label: "24.GRC_modalidadTraslado"
                                        }),
                                        search.createColumn({
                                            name: "formulatext",
                                            formula: "TO_CHAR({custbodype_fecha_inicio_del_traslado},'YYYY-MM-DD')",
                                            label: "25.GRC_fechaInicioTraslado"
                                        }),
                                        search.createColumn({ name: "custbody_pe_ruc_empresa_transporte", label: "26.GRC_numeroRucTransportista" }),
                                        search.createColumn({
                                            name: "custrecord_pe_cod_doc_type",
                                            join: "CUSTBODY_PE_TIPO_DOC_TRANSPORTISTA",
                                            label: "27.GRC_tipoDocTransportista"
                                        }),
                                        search.createColumn({ name: "custbody_pe_denominacion_transportador", label: "28.GRC_denominacionTransportador" }),
                                        search.createColumn({ name: "custbody_pe_car_plate", label: "29.GRC_numeroPlacaVehiculo" }),
                                        search.createColumn({ name: "custbody_pe_driver_document_number", label: "30.GRC_numeroDocIdeConductor" }),
                                        search.createColumn({
                                            // name: "custrecord_pe_cod_doc_ide_conductor",
                                            // join: "CUSTBODY_PE_DOC_IDENTIDAD_CONDUCTOR",
                                            name: "custbody_pe_doc_identidad_conductor",
                                            label: "31.GRC_tipoDocIdeConductor"
                                        }),
                                        search.createColumn({
                                            // name: "custrecord_pe_codigo",
                                            // join: "CUSTBODY_PE_UBIGEO_PTO_LLEGADA",
                                            name: "custbody_pe_ubigeo_pto_llegada",
                                            label: "32.GRC_ubigeoPuntoLlegada"
                                        }),
                                        search.createColumn({ name: "custbody_pe_direccion_punto_llegada", label: "33.GRC_direccionPuntoLlegada" }),
                                        search.createColumn({
                                            name: "custbody_pe_ubigeo_pto_partida",
                                            //join: "CUSTBODY_PE_UBIGEO_PTO_PARTIDA",
                                            label: "34.GRC_ubigeoPuntoPartida"
                                        }),
                                        search.createColumn({ name: "custbody_pe_direccion_punto_partida", label: "35.GRC_direccionPuntoPartida" }),
                                        search.createColumn({ name: "custbody_pe_tipo_conductor", label: "36.GCA_tipoConductor" }),
                                        search.createColumn({ name: "custbody_pe_driver_name", label: "37.GCA_nomConductor" }),
                                        search.createColumn({ name: "custbody_pe_driver_last_name", label: "38.GCA_apeConductor" }),
                                        search.createColumn({ name: "custbody_pe_driver_license", label: "39.GCA_numLicCondConductor" }),
                                        search.createColumn({ name: "custbody_pe_serie", label: "40.Serie" }),
                                        search.createColumn({ name: "custbody_pe_number", label: "41.Correlativo" }),
                                        search.createColumn({ name: "custbody_pe_document_type", label: "42.TipoDocumento" }),
                                        search.createColumn({
                                            name: "internalid",
                                            join: "customer",
                                            label: "43.CustomerId"
                                        }),
                                        search.createColumn({
                                            name: "recordtype",
                                            join: "createdFrom",
                                            label: "44.CreatedFromType"
                                        }),
                                        search.createColumn({
                                            name: "custentity_pe_document_type",
                                            join: "vendor",
                                            label: "45.DDE_tipoDocId_vendor"
                                        }),
                                        search.createColumn({
                                            name: "vatregnumber",
                                            join: "vendor",
                                            label: "46.DDE_numeroDocId_vendor"
                                        }),
                                        search.createColumn({
                                            name: "companyname",
                                            join: "vendor",
                                            label: "47.DDE_razonSocial_vendor"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "vendor",
                                            label: "48.DDE_direccion_vendor"
                                        }),
                                        search.createColumn({
                                            name: "phone",
                                            join: "vendor",
                                            label: "49.DDE_telefono_vendor"
                                        }),
                                        search.createColumn({
                                            name: "email",
                                            join: "vendor",
                                            label: "50.DDE_correoElectronico_vendor"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "location",
                                            label: "51 Dirección Ubicación"
                                        })
                                    ]
                            });

                            var searchResult = searchLoad.run().getRange({ start: 0, end: 1 });
                            // IDE---------------------------------------------------------------------------------------------------------------------
                            var column01 = searchResult[0].getValue(searchLoad.columns[0]);
                            var column02 = searchResult[0].getValue(searchLoad.columns[1]);
                            var column03 = searchResult[0].getValue(searchLoad.columns[2]);
                            var column04 = searchResult[0].getValue(searchLoad.columns[3]);
                            // EMI---------------------------------------------------------------------------------------------------------------------
                            var column05 = searchResult[0].getValue(searchLoad.columns[4]);
                            var column06 = searchResult[0].getValue(searchLoad.columns[5]);
                            var column07 = searchResult[0].getValue(searchLoad.columns[6]);
                            var column08 = searchResult[0].getValue(searchLoad.columns[7]);
                            var column09 = searchResult[0].getValue(searchLoad.columns[8]);
                            var column10 = searchResult[0].getValue(searchLoad.columns[9]);
                            var column11 = searchResult[0].getValue(searchLoad.columns[10]);
                            var column12 = searchResult[0].getValue(searchLoad.columns[11]);
                            var column13 = searchResult[0].getValue(searchLoad.columns[12]);
                            // DDE-Customer---------------------------------------------------------------------------------------------------------------------
                            var column14 = searchResult[0].getText(searchLoad.columns[13]);
                            var column15 = searchResult[0].getValue(searchLoad.columns[14]);
                            var column16 = searchResult[0].getValue(searchLoad.columns[15]);
                            var column17 = searchResult[0].getText(searchLoad.columns[16]);
                            var column18 = searchResult[0].getValue(searchLoad.columns[17]);
                            var column19 = searchResult[0].getValue(searchLoad.columns[18]);
                            // GRC---------------------------------------------------------------------------------------------------------------------
                            var column20 = searchResult[0].getText(searchLoad.columns[19]);
                            var column21 = searchResult[0].getText(searchLoad.columns[20]);
                            var column22 = searchResult[0].getValue(searchLoad.columns[21]);
                            var column23 = searchResult[0].getValue(searchLoad.columns[22]);
                            var column24 = searchResult[0].getValue(searchLoad.columns[23]);
                            var column25 = searchResult[0].getValue(searchLoad.columns[24]);
                            var column26 = searchResult[0].getValue(searchLoad.columns[25]);
                            var column27 = searchResult[0].getValue(searchLoad.columns[26]);
                            var column28 = searchResult[0].getValue(searchLoad.columns[27]);
                            var column29 = searchResult[0].getValue(searchLoad.columns[28]);
                            var column30 = searchResult[0].getValue(searchLoad.columns[29]);
                            var column31 = searchResult[0].getText(searchLoad.columns[30]);
                            var column32 = searchResult[0].getText(searchLoad.columns[31]);
                            var column33 = searchResult[0].getValue(searchLoad.columns[32]).replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            var column34 = searchResult[0].getText(searchLoad.columns[33]);
                            var column35 = searchResult[0].getValue(searchLoad.columns[34]);
                            // GCA----------------------------------------------------------------------------------------------------------------------
                            var column36 = searchResult[0].getValue(searchLoad.columns[35]);
                            var column37 = searchResult[0].getValue(searchLoad.columns[36]);
                            var column38 = searchResult[0].getValue(searchLoad.columns[37]);
                            var column39 = searchResult[0].getValue(searchLoad.columns[38]);
                            // SERIE---------------------------------------------------------------------------------------------------------------------
                            var column40 = searchResult[0].getText(searchLoad.columns[39]);
                            // CORRELATIVO---------------------------------------------------------------------------------------------------------------
                            var column41 = searchResult[0].getValue(searchLoad.columns[40]);
                            // TIPO DOCUMENTO------------------------------------------------------------------------------------------------------------
                            var column42 = searchResult[0].getText(searchLoad.columns[41]);
                            // ID CUSTOMER------------------------------------------------------------------------------------------------------------
                            var column43 = searchResult[0].getText(searchLoad.columns[42]);
                            // CREATED FROM------------------------------------------------------------------------------------------------------------
                            var column44 = searchResult[0].getValue(searchLoad.columns[43]);
                            // DDE-Vendor---------------------------------------------------------------------------------------------------------------------
                            var column45 = searchResult[0].getText(searchLoad.columns[44]);
                            var column46 = searchResult[0].getValue(searchLoad.columns[45]);
                            var column47 = searchResult[0].getValue(searchLoad.columns[46]);
                            var column48 = searchResult[0].getValue(searchLoad.columns[47]);
                            var column49 = searchResult[0].getValue(searchLoad.columns[48]);
                            var column50 = searchResult[0].getValue(searchLoad.columns[49]);
                            var column51 = searchResult[0].getValue(searchLoad.columns[50]);


                            xmlJSON.numeracion = column01;
                            xmlJSON.fechaEmision = column02;
                            xmlJSON.horaEmision = column03;
                            xmlJSON.codTipoDocumento = column04;

                            xmlJSON.tipoDocIdEmi = 'Registro Único de Contribuyentes';
                            xmlJSON.numeroDocIdEmi = column06;
                            xmlJSON.nombreComercialEmi = column07.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.razonSocialEmi = column08.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            //json_emi.ubigeo = column09;
                            xmlJSON.direccionEmi = column10;
                            xmlJSON.codigoPaisEmi = 'PE';
                            xmlJSON.telefonoEmi = column12;
                            xmlJSON.correoElectronicoEmi = column13;


                            var tipoDocId = '';
                            var numeroDocId = '';
                            var razonSocial = '';
                            var direccion = '';
                            var telefono = '';
                            var correoElectronico = '';
                            log.debug('column44', column44);

                            if (column44 == SALES_ORDER) {

                                tipoDocId = tipoDocumento;
                                numeroDocId = column15;
                                razonSocial = column16;
                                direccion = column17;
                                telefono = column18;
                                correoElectronico = column19;

                            } else if (column44 == TRANSFER_ORDER) {

                                tipoDocId = tipoDocumento;
                                numeroDocId = column06;
                                razonSocial = column08;
                                direccion = column10;
                                telefono = column12;
                                correoElectronico = column13;

                            } else if (column44 == VENDOR_AUTORIZATION) {

                                tipoDocId = tipoDocumento;
                                numeroDocId = column46;
                                razonSocial = column47;
                                direccion = column48;
                                telefono = column49;
                                correoElectronico = column50;

                            }

                            xmlJSON.tipoDocId = tipoDocId;
                            xmlJSON.numeroDocId = numeroDocId;
                            xmlJSON.razonSocial = razonSocial.replace(/&/g, '&amp;');
                            xmlJSON.direccion = direccion.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.telefono = telefono;
                            xmlJSON.correoElectronico = correoElectronico;

                            xmlJSON.idTraslado = 'Sunat_envío';
                            xmlJSON.motivoTraslado = column20.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.descripcionMotivoTraslado = column21.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.pesoBrutoBienes = column22;
                            xmlJSON.unidadMedidaPesoBruto = column23;
                            xmlJSON.modalidadTraslado = column24;
                            xmlJSON.fechaInicioTraslado = column25;
                            if (column24 == '01') {
                                xmlJSON.numeroRucTransportista = column26;
                                xmlJSON.tipoDocTransportista = column27;
                                xmlJSON.denominacionTransportador = column28;
                            } else if (column24 == '02') {
                                xmlJSON.numeroPlacaVehiculo = column29;
                                xmlJSON.numeroDocIdeConductor = column30;
                                xmlJSON.tipoDocIdeConductor = column31;
                            }
                            xmlJSON.ubigeoPuntoLlegada = column32;
                            xmlJSON.direccionPuntoLlegada = column33.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.ubigeoPuntoPartida = column34;
                            xmlJSON.direccionPuntoPartida = column35.replace(/[^a-zA-Z 0-9.]+/g, ' ');


                            var getDetails = getLinesDetails(rec_id);
                            xmlJSON.vehicSecundario = getDetails.vehiculos_secundarios;
                            xmlJSON.tipoConductor = column36;
                            xmlJSON.nomConductor = column37;
                            xmlJSON.apeConductor = column38;
                            xmlJSON.numLicCondConductor = column39;
                            xmlJSON.addressLocation = column51.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.conductoresSecundarios = getDetails.conductores_secundarios;

                        } else {
                            var searchLoad = search.create({
                                type: "itemfulfillment",
                                filters:
                                    [
                                        ["type", "anyof", BUSQ_GUIA_REMISION],
                                        "AND",
                                        ["internalid", "anyof", rec_id]
                                    ],
                                columns:
                                    [
                                        search.createColumn({
                                            name: "custbody_pe_motivo_traslado",
                                            label: "0. GRC_motivoTraslado"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "customer",
                                            label: "1.DDE_direccion_customer"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "subsidiary",
                                            label: "2.EMI_direccion"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "vendor",
                                            label: "3.DDE_direccion_vendor"
                                        }),
                                        search.createColumn({
                                            name: "internalid",
                                            join: "customer",
                                            label: "4.CustomerId"
                                        }),
                                        search.createColumn({
                                            name: "address1",
                                            join: "subsidiary",
                                            label: "5.EMI_direccion"
                                        }),
                                        search.createColumn({
                                            name: "formulatext",
                                            formula: "CONCAT({custbody_pe_serie}, CONCAT('-', {custbody_pe_number}))",
                                            label: "6.IDE_numeracion"
                                        }),
                                        search.createColumn({
                                            name: "custbody_pe_direccion_punto_partida",
                                            label: "7.GRC_direccionPuntoPartida"
                                        }),
                                        search.createColumn({
                                            name: "custbody_pe_direccion_punto_llegada",
                                            label: "8.GRC_direccionPuntoLlegada"
                                        }),
                                        search.createColumn({
                                            name: "custbody_pe_peso_tn",
                                            label: "9.GRC_motivoTraslado"
                                        }),
                                        search.createColumn({
                                            name: "custbody_pe_unidad_medida_pb",
                                            label: "10.GRC_motivoTraslado"
                                        }),
                                        search.createColumn({
                                            name: "custbody1",
                                            label: "11.Agente"
                                        }),
                                    ],
                            });
                            var searchResult = searchLoad.run().getRange({ start: 0, end: 1 });
                            var column0 = searchResult[0].getText(searchLoad.columns[0]);
                            var column1 = searchResult[0].getText(searchLoad.columns[1]);
                            var column2 = searchResult[0].getText(searchLoad.columns[2]);
                            var column3 = searchResult[0].getText(searchLoad.columns[3]);
                            var column4 = searchResult[0].getText(searchLoad.columns[4]);
                            var column5 = searchResult[0].getText(searchLoad.columns[5]);
                            var column6 = searchResult[0].getValue(searchLoad.columns[6]);
                            var column7 = searchResult[0].getValue(searchLoad.columns[7]);
                            if (column7 != null) {
                                column7 = column7.replace(/&/g, '&amp;');
                            } else {
                                column7 = '';
                            }
                            var column8 = searchResult[0].getValue(searchLoad.columns[8]);
                            if (column8 != null) {
                                column8 = column8.replace(/&/g, '&amp;');
                            } else {
                                column8 = '';
                            }
                            var column9 = searchResult[0].getValue(searchLoad.columns[9]);
                            var column10 = searchResult[0].getText(searchLoad.columns[10]);
                            log.debug('column10', column10);
                            var column11 = searchResult[0].getValue(searchLoad.columns[11]);
                            if (column11 != null) {
                                column11 = column11.replace(/&/g, '&amp;');
                            } else {
                                column11 = '';
                            }
                            log.debug('column11', column11);
                            var direccion = '';
                            if (column4 == SALES_ORDER) {
                                direccion = column1;
                            } else if (column4 == TRANSFER_ORDER) {
                                direccion = column2;
                            } else if (column4 == VENDOR_AUTORIZATION) {
                                direccion = column3;
                            }
                            xmlJSON.direccion = direccion.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.motivoTraslado = column0;
                            xmlJSON.direccionEmi = column5;
                            xmlJSON.numeracion = column6;
                            xmlJSON.direccionPuntoPartida = column7.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.direccionPuntoLlegada = column8.replace(/[^a-zA-Z 0-9.]+/g, ' ');
                            xmlJSON.internalid = rec_id;
                            xmlJSON.peso_bruto = column9 + ' ' + column10;
                            xmlJSON.agente = column11;
                            id_template = './TS_FM_Item_Fullfilment.ftl';
                        }


                        // INFORMACIÓN DE RECORD RELACIONADO (LINEAS)
                        var linesRecRel = recRel.getLineCount('item');
                        var arrayItemsRecRel = [];
                        for (var k = 0; k < linesRecRel; k++) {
                            arrayItemsRecRel.push({ 'item': recRel.getSublistValue('item', 'item', k), 'rate': recRel.getSublistValue('item', 'rate', k), 'tax1amt': recRel.getSublistValue('item', 'tax1amt', k), 'grossamt': recRel.getSublistValue('item', 'grossamt', k) })
                        }
                        var totalDscto = 0;
                        for (var i = 0; i < arrayItemsRecRel.length; i++) {
                            var compararID = getItemDscto(arrayItemsRecRel[i].item);
                            if (compararID == arrayItemsRecRel[i].item) {
                                var sumaDscto = arrayItemsRecRel[i].grossamt;
                                totalDscto += sumaDscto;
                            }
                        }
                        log.debug('totalDscto', totalDscto);
                        totalDscto = Number(totalDscto) * -1
                        // LINEAS DE ITEMS
                        var item_lines = rec.getLineCount('item');
                        var items = [];
                        var subtotal = [];
                        var unidades = [];
                        var totalconigv = 0.00;
                        var total_unidades = 0;
                        for (var i = 0; i < item_lines; i++) {
                            var item_id = rec.getSublistText('item', 'item', i);
                            var item_upc = getDataItem(item_id)['upccode'];
                            var item_name = rec.getSublistText('item', 'itemname', i);
                            var item_descripcion = rec.getSublistText('item', 'description', i);
                            var item_quantity = rec.getSublistValue('item', 'quantity', i);
                            var item_units = rec.getSublistText('item', 'unitsdisplay', i);
                            var rateRecRel = findRate(arrayItemsRecRel, item_id);
                            var taxamount = findTax(arrayItemsRecRel, item_id);
                            log.debug('taxamount', taxamount);
                            var total = Number((Number(item_quantity) * (Number(rateRecRel) + (Number(taxamount) / Number(item_quantity))).toFixed(2)).toFixed(2)).toFixed(2);
                            subtotal[i] = Number(total) + Number(totalconigv);
                            totalconigv = Number(subtotal[i]);
                            unidades[i] = Number(item_quantity) + Number(total_unidades);
                            total_unidades = Number(unidades[i]);
                            var json_item = {
                                "item": item_name,
                                "description": item_descripcion.replace(/[^a-zA-Z 0-9.]+/g, ' '),
                                "taxamount": (Number(taxamount) / Number(item_quantity)).toFixed(2),
                                "pvp": (Number(rateRecRel) + (Number(taxamount) / Number(item_quantity))).toFixed(2),
                                "quantity": item_quantity,
                                "units": item_units,
                                "upc": item_upc,
                                "total": Number((Number(item_quantity) * (Number(rateRecRel) + (Number(taxamount) / Number(item_quantity))).toFixed(2)).toFixed(2)).toFixed(2),
                                "preciounitario": Number(rateRecRel).toFixed(2),
                            }
                            items.push(json_item);
                        }
                        log.debug('totalconigv', totalconigv);
                        xmlJSON.location = rec.getSublistText('item', 'location', 0);
                        xmlJSON.subtotal = Number(totalconigv).toFixed(2);
                        xmlJSON.sumaDscto = Number(totalDscto).toFixed(2);
                        xmlJSON.totalEmision = Number(Number(totalconigv) - Number(totalDscto)).toFixed(2);
                        xmlJSON.unidades = total_unidades;
                        xmlJSON.item = items;

                    }
                    log.debug('xmlJSON', xmlJSON);


                    // Renderiza el PDF
                    var renderer = render.create();
                    //Archivo del file cabinet
                    var objfile = file.load({
                        id: id_template
                    });
                    var objfile = objfile.getContents();
                    renderer.templateContent = objfile;
                    renderer.addCustomDataSource({
                        format: render.DataSource.OBJECT,
                        alias: 'record',
                        data: xmlJSON
                    });
                    result = renderer.renderAsString();
                    var myFileObj = render.xmlToPdf({
                        xmlString: result
                    });
                    pdfContent = myFileObj.getContents();
                    context.response.renderPdf(result);

                    log.debug("FIN", "FIN");
                }

                var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
                log.debug('fin', remainingUsage);


            } catch (e) {
                log.error("Error", "[ onRequest ] " + e);
            }

        }

        function getItemDscto(id) {
            try {
                var arrItemId = new Array();
                var busqueda = search.create({
                    type: "discountitem",
                    filters:
                        [
                            ["type", "anyof", "Discount"],
                            "AND",
                            ["internalid", "anyof", id]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "Internal ID" })
                        ]
                });
                var pageData = busqueda.runPaged({
                    pageSize: 1000
                });

                pageData.pageRanges.forEach(function (pageRange) {
                    page = pageData.fetch({
                        index: pageRange.index
                    });
                    page.data.forEach(function (result) {
                        var columns = result.columns;
                        var arrDscto = new Array();
                        //0. Internal id match
                        if (result.getValue(columns[0]) != null)
                            arrDscto[0] = result.getValue(columns[0]);
                        else
                            arrDscto[0] = '';
                        arrItemId.push(arrDscto);
                    });
                });
                return arrItemId;
            } catch (e) {
                log.error('Error en getCustomer', e);
            }
        }
        function findRate(_array, _id_item) {
            try {
                var rate = 0;
                var tax1amt = 0;
                for (var j = 0; j < _array.length; j++) {
                    if (_array[j]['item'] === _id_item) {
                        rate = _array[j]['rate'];
                        break;
                    } else {
                        continue;
                    }
                }
                return rate;

            } catch (e) {
                log.error("Error", "[ findRate ] " + e);
            }

        }
        function findTax(_array, _id_item) {
            try {
                var rate = 0;
                var tax1amt = 0;
                for (var j = 0; j < _array.length; j++) {
                    if (_array[j]['item'] === _id_item) {
                        tax1amt = _array[j]['tax1amt'];
                        break;
                    } else {
                        continue;
                    }
                }
                return tax1amt;

            } catch (e) {
                log.error("Error", "[ findTax ] " + e);
            }

        }



        function getLinesDetails(_id_guia) {
            try {

                var arrCondSec = [];
                var arrVehSec = [];

                var recGuiaRemision = record.load({ type: REC_GUIA_REMISION, id: _id_guia, isDynamic: true });

                var recLinesConductorSec = recGuiaRemision.getLineCount(ID_LIST_CONDUCTOR_SEC);
                var recLinesVehiculoSec = recGuiaRemision.getLineCount(ID_LIST_VEHICULO_SEC);

                for (var c = 0; c < recLinesConductorSec; c++) {
                    var objCondSec = {};
                    objCondSec.tipoConductorSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_CONDUCTOR_SEC, fieldId: "custrecord_pe_tipo_conductor", line: c });
                    objCondSec.numeroDocIdeConductorSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_CONDUCTOR_SEC, fieldId: "custrecord_pe_nmro_doc_identidad", line: c });
                    objCondSec.tipoDocIdeConductorSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_CONDUCTOR_SEC, fieldId: "custrecord_pe_tipo_doc_identidad", line: c });
                    objCondSec.nomConductorSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_CONDUCTOR_SEC, fieldId: "custrecord_pe_nombre_conductor", line: c });
                    objCondSec.apeConductorSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_CONDUCTOR_SEC, fieldId: "custrecord_pe_apellido_conductor", line: c });
                    objCondSec.numLicCondConductorSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_CONDUCTOR_SEC, fieldId: "custrecord_pe_nmro_licencia_conducir", line: c });
                    arrCondSec.push(objCondSec);
                }

                for (var v = 0; v < recLinesVehiculoSec; v++) {
                    var objVehSec = {};
                    objVehSec.numeroPlacaVehiculoSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_VEHICULO_SEC, fieldId: "custrecord_pe_nmro_placa_veh_sec", line: v });
                    objVehSec.tarjetaUnicaCircElectVehSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_VEHICULO_SEC, fieldId: "custrecord_pe_tarj_unica_circ_electronic", line: v });
                    objVehSec.entidadEmisoraAutEspVehSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_VEHICULO_SEC, fieldId: "custrecord_pe_entidad_emis_aut_especial", line: v });
                    objVehSec.numeroAutEspVehSec = recGuiaRemision.getSublistValue({ sublistId: ID_LIST_VEHICULO_SEC, fieldId: "custrecord_pe_nmro_autorizacion_especial", line: v });
                    arrVehSec.push(objVehSec);
                }

                return {
                    vehiculos_secundarios: arrVehSec,
                    conductores_secundarios: arrCondSec,
                }


            } catch (e) {
                log.error('Error en getConductorVehiculoSecundario', e);
            }
        }


        function getDataItem(_id_item) {
            try {
                var recITem = search.lookupFields({
                    type: 'item',
                    id: _id_item,
                    columns: ['upccode']
                });

                return {
                    upccode: recITem['upccode']
                }

            } catch (e) {

            }
        }

        return {
            onRequest: onRequest
        };

    });
/********************************************************************************************************************************************************
TRACKING
/********************************************************************************************************************************************************
/* Commit:01
Version: 1.0
Date: 27/06/2022
Author: Jean Ñique
Description: Creación del script.
========================================================================================================================================================*/