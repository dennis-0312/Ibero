/**
 *@NApiVersion 2.x
 *@NScriptType ClientScript
 */
define(['N/currentRecord', 'N/url'], function (currentRecord, url) {

    function pageInit(context) {

    }

    function saveRecord(context) {

    }

    function validateField(context) {

    }

    function fieldChanged(context) {

        var record = currentRecord.get();
        try {

            if (context.fieldId == 'custpage_pageid') {

                var pageId = record.getValue('custpage_pageid');
                pageId = parseInt(pageId.split('_')[1]);
                //var flag = record.getText('custpage_flag');
                var isbn = record.getText('custpage_isbn');
                var nombre = record.getValue('custpage_nombre');
                var autor = record.getValue('custpage_autor');
                var editorial = record.getValue('custpage_editorial');
                var categoria = record.getValue('custpage_categoria');
                var subcategoria = record.getValue('custpage_subcategoria');
                var ubicacion = record.getValue('custpage_ubicacion');
                var vendor = record.getValue('custpage_vendor');

                document.location = url.resolveScript({
                    scriptId: getParameterFromURL('script'),
                    deploymentId: getParameterFromURL('deploy'),
                    returnExternalUrl: true,
                    params: {
                        editorial: editorial,
                        //flag: flag,
                        isbn: isbn,
                        nombre: nombre,
                        autor: autor,
                        categoria: categoria,
                        subcategoria: subcategoria,
                        ubicacion: ubicacion,
                        vendor: vendor,
                        page: pageId
                    }
                });
            }

        } catch (e) {
            console.log('Error en fieldChanged', e);
        }
    }

    function postSourcing(context) {

    }

    function lineInit(context) {

    }

    function validateDelete(context) {

    }

    function validateInsert(context) {

    }

    function validateLine(context) {

    }

    function sublistChanged(context) {

    }


    function getParameterFromURL(param) {
        var query = window.location.search.substring(1);
        var vars = query.split("&");
        for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            if (pair[0] == param) {
                return decodeURIComponent(pair[1]);
            }
        }
        return (false);
    }


    function cancelar() {
        try {
            var currentUrl = document.location.href;
            currentUrl = currentUrl.split('&editorial');
            currentUrl = currentUrl[0];
            var urls = new URL(currentUrl);
            window.onbeforeunload = null;
            window.location.replace(urls);
        } catch (e) {
            console.log('Error-cancelar' + ' - ' + e);
        }
    }


    return {
        // pageInit: pageInit,
        // saveRecord: saveRecord,
        // validateField: validateField,
        fieldChanged: fieldChanged,
        // postSourcing: postSourcing,
        // lineInit: lineInit,
        // validateDelete: validateDelete,
        // validateInsert: validateInsert,
        // validateLine: validateLine,
        // sublistChanged: sublistChanged,
        cancelar: cancelar
    }
});
