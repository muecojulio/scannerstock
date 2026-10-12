/**
 * Clasificación SIC por grupo mayor (2 dígitos) + división.
 *
 * GENERADO por scripts/vendor-sic.mjs — no editar a mano. Origen: SIC Manual de
 * la OSHA / Oficina de Presupuesto de EE. UU. (obra del gobierno federal,
 * dominio público), tomado del repositorio público de GitHub `bigspotteddog/SIC-Codes`
 * (https://github.com/bigspotteddog/SIC-Codes, archivo sic_codes.csv, commit 431c875).
 * Se conservan solo los 83 grupos mayores y las 10
 * divisiones: es lo que la aplicación necesita para enrutar el modelo de
 * negocio cuando la SEC no devuelve descripción, y pesa ~8 KB en vez de los
 * 139 KB de la tabla completa de 4 dígitos.
 *
 * Regenerar: node scripts/vendor-sic.mjs (verificar: --check).
 */

/** División SIC (letra) → nombre en inglés, tal como la publica el SIC Manual. */
export const SIC_DIVISIONS: Readonly<Record<string, string>> = {
  A: "Agriculture, Forestry, And Fishing",
  B: "Mining",
  C: "Construction",
  D: "Manufacturing",
  E: "Transportation, Communications, Electric, Gas, And Sanitary Services",
  F: "Wholesale Trade",
  G: "Retail Trade",
  H: "Finance, Insurance, And Real Estate",
  I: "Services",
  J: "Public Administration",
};

/** Rango de grupos mayores de cada división. */
export const SIC_DIVISION_RANGES: ReadonlyArray<readonly [string, number, number]> = [
  ["A", 1, 9],
  ["B", 10, 14],
  ["C", 15, 17],
  ["D", 20, 39],
  ["E", 40, 49],
  ["F", 50, 51],
  ["G", 52, 59],
  ["H", 60, 67],
  ["I", 70, 89],
  ["J", 91, 99],
];

/** Grupo mayor (2 dígitos) → descripción oficial del SIC Manual. */
export const SIC_MAJOR_GROUPS: Readonly<Record<number, string>> = {
  1: "Agricultural Production Crops",
  2: "Agriculture Production Livestock And Animal Specialties",
  7: "Agricultural Services",
  8: "Forestry",
  9: "Fishing, Hunting, And Trapping",
  10: "Metal Mining",
  12: "Coal Mining",
  13: "Oil And Gas Extraction",
  14: "Mining And Quarrying Of Nonmetallic Minerals, Except Fuels",
  15: "Building Construction General Contractors And Operative Builders",
  16: "Heavy Construction Other Than Building Construction Contractors",
  17: "Construction Special Trade Contractors",
  20: "Food And Kindred Products",
  21: "Tobacco Products",
  22: "Textile Mill Products",
  23: "Apparel And Other Finished Products Made From Fabrics And Similar Materials",
  24: "Lumber And Wood Products, Except Furniture",
  25: "Furniture And Fixtures",
  26: "Paper And Allied Products",
  27: "Printing, Publishing, And Allied Industries",
  28: "Chemicals And Allied Products",
  29: "Petroleum Refining And Related Industries",
  30: "Rubber And Miscellaneous Plastics Products",
  31: "Leather And Leather Products",
  32: "Stone, Clay, Glass, And Concrete Products",
  33: "Primary Metal Industries",
  34: "Fabricated Metal Products, Except Machinery And Transportation Equipment",
  35: "Industrial And Commercial Machinery And Computer Equipment",
  36: "Electronic And Other Electrical Equipment And Components, Except Computer Equipment",
  37: "Transportation Equipment",
  38: "Measuring, Analyzing, And Controlling Instruments; Photographic, Medical And Optical Goods; Watches And Clocks",
  39: "Miscellaneous Manufacturing Industries",
  40: "Railroad Transportation",
  41: "Local And Suburban Transit And Interurban Highway Passenger Transportation",
  42: "Motor Freight Transportation And Warehousing",
  43: "United States Postal Service",
  44: "Water Transportation",
  45: "Transportation By Air",
  46: "Pipelines, Except Natural Gas",
  47: "Transportation Services",
  48: "Communications",
  49: "Electric, Gas, And Sanitary Services",
  50: "Wholesale Trade-Durable Goods",
  51: "Wholesale Trade-Non-Durable Goods",
  52: "Building Materials, Hardware, Garden Supply, And Mobile Home Dealers",
  53: "General Merchandise Stores",
  54: "Food Stores",
  55: "Automotive Dealers And Gasoline Service Stations",
  56: "Apparel And Accessory Stores",
  57: "Home Furniture, Furnishings, And Equipment Stores",
  58: "Eating And Drinking Places",
  59: "Miscellaneous Retail",
  60: "Depository Institutions",
  61: "Non-Depository Credit Institutions",
  62: "Security And Commodity Brokers, Dealers, Exchanges, And Services",
  63: "Insurance Carriers",
  64: "Insurance Agents, Brokers, And Service",
  65: "Real Estate",
  67: "Holding And Other Investment Offices",
  70: "Hotels, Rooming Houses, Camps, And Other Lodging Places",
  72: "Personal Services",
  73: "Business Services",
  75: "Automotive Repair, Services, And Parking",
  76: "Miscellaneous Repair Services",
  78: "Motion Pictures",
  79: "Amusement And Recreation Services",
  80: "Health Services",
  81: "Legal Services",
  82: "Educational Services",
  83: "Social Services",
  84: "Museums, Art Galleries, And Botanical And Zoological Gardens",
  86: "Membership Organizations",
  87: "Engineering, Accounting, Research, Management, And Related Services",
  88: "Private Households",
  89: "Miscellaneous Services",
  91: "Executive, Legislative, And General Government, Except Finance",
  92: "Justice, Public Order, And Safety",
  93: "Public Finance, Taxation, And Monetary Policy",
  94: "Administration Of Human Resource Programs",
  95: "Administration Of Environmental Quality And Housing Programs",
  96: "Administration Of Economic Programs",
  97: "National Security And International Affairs",
  99: "Nonclassifiable Establishments",
};
