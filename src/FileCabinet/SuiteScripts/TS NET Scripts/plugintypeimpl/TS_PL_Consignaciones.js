function customizeGlImpact(transactionRecord, standardLines, customLines, book) {
    try {
        var countStandard = parseInt(standardLines.getCount());
        countStandard = countStandard - 1;
        //nlapiLogExecution("DEBUG", "Line Count", countStandard);
        // var currLine = standardLines.getLine(0);
        // var entityId = currLine.getEntityId();
        // var tranSubsidiary = transactionRecord.getFieldValue('subsidiary');
        var recordType = transactionRecord.getRecordType();
        //nlapiLogExecution("DEBUG", "RecordType", recordType);
        var esconsignacion = transactionRecord.getFieldValue('custbody_pe_es_consignacion');
        //nlapiLogExecution("DEBUG", "Check", esconsignacion);
        if (recordType == 'itemreceipt' && esconsignacion == 'T') { //itemfulfillment
            // nlapiLogExecution("DEBUG", "Validate", 'Entré a GL');
            for (var i = 1; i <= countStandard; i++) {
                var newLine = customLines.addNewLine();
                newLine.setDebitAmount(standardLines.getLine(i).getDebitAmount());
                newLine.setAccountId(123);
                newLine.setMemo("Consignación");

                var newLine = customLines.addNewLine();
                newLine.setCreditAmount(standardLines.getLine(i).getDebitAmount());
                newLine.setAccountId(standardLines.getLine(i).getAccountId());
                newLine.setMemo("Consignación");
            }
        }



        // else if (recordType == 'itemreceipt' && esconsignacion == 'T') {
        //     var newLine = customLines.addNewLine();
        //     newLine.setCreditAmount(standardLines.getLine(0).getCreditAmount());
        //     newLine.setAccountId(123);
        //     newLine.setMemo("Consignación");

        //     var newLine = customLines.addNewLine();
        //     newLine.setDebitAmount(standardLines.getLine(1).getDebitAmount());
        //     newLine.setAccountId(standardLines.getLine(1).getAccountId());
        //     newLine.setMemo("Consignación");
        // }



        //transactionRecord.setFieldValue('custbody_pe_document_series_ref', 'pruebaPlugin', null, true);


        // var commission = parseFloat(transactionRecord.getFieldValue('custbody_commission_total'));
        // if (recordType == 'itemreceipt') {
        //     nlapiLogExecution("DEBUG", "commission", commission);
        //     var newLine = customLines.addNewLine();
        //     newLine.setDebitAmount(100);
        //     newLine.setAccountId(123);
        //     newLine.setEntityId(entityId);
        //     newLine.setMemo("Commissions");
        //     var newLine = customLines.addNewLine();
        //     newLine.setCreditAmount(100);
        //     newLine.setAccountId(5082);
        //     newLine.setEntityId(entityId);
        //     newLine.setMemo("Commissions Liability");

        // }
    } catch (error) {
        nlapiLogExecution('ERROR', 'Error performing error logging: ' + error);
    }

}