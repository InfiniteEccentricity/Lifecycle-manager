# import tabula
# dfs = tabula.read_pdf("RA_software/data/product_software_catalog.pdf", pages="all")
# tabula.convert_into("RA_software/data/product_software_catalog.pdf", "output.csv", output_format="csv", pages="all")
    
import camelot
tables = camelot.read_pdf('RA_software/data/product_software_catalog.pdf')
