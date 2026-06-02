package com.restaurant.service;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * Регрессия: для FORMULA нельзя брать {@link Cell#getCellFormula()} как «значение ячейки» для сопоставления
 * со справочником — нужно отображаемое значение (как в ExcelUploadService через DataFormatter).
 * Пример: ячейка {@code =A1} показывает «Авокадо», а getCellFormula() возвращает {@code A1}.
 */
class ExcelFormulaCellDisplayTest {

    @Test
    void dataFormatter_returnsDisplayText_forReferenceFormula_notTheFormulaSource() throws IOException {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sh = wb.createSheet();
            Row row = sh.createRow(0);
            Cell stringCell = row.createCell(0);
            stringCell.setCellValue("Авокадо");

            Cell formulaCell = row.createCell(1);
            // Excel: =A1 — на экране то же «Авокадо», в getCellFormula() — «A1»
            formulaCell.setCellFormula("A1");

            FormulaEvaluator eval = wb.getCreationHelper().createFormulaEvaluator();
            eval.evaluateFormulaCell(formulaCell);

            DataFormatter df = new DataFormatter();

            assertEquals("Авокадо", df.formatCellValue(stringCell, eval).trim());
            assertEquals("Авокадо", df.formatCellValue(formulaCell, eval).trim());

            assertNotEquals("Авокадо", formulaCell.getCellFormula());
        }
    }
}
