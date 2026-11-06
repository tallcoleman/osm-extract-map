# Levels report

Built from `data/current` (generated 2026-11-06T18:56:31.889Z).

## Extracts per depth

"all / leaves" at each depth, after overrides. Bundles are counted separately.

| Provider | Depth 0 | Depth 1 | Depth 2 | Depth 3 | Total | Bundles |
| --- | --- | --- | --- | --- | --- | --- |
| geofabrik | 8 / 1 | 194 / 176 | 268 / 261 | 74 / 74 | 544 | 10 |
| osmfr | 7 / 0 | 197 / 156 | 564 / 504 | 426 / 426 | 1194 | 2 |

- geofabrik bundles: `alps`, `britain-and-ireland`, `dach`, `great-britain`, `sea`, `south-africa-and-lesotho`, `us-midwest`, `us-northeast`, `us-south`, `us-west`
- osmfr bundles: `asia/india/dadra_and_nagar_haveli_and_daman_and_diu`, `asia/israel_and_palestine`

## Features shown per level view

Level *d* shows extracts at depth *d* ("normal") plus leaves above it ("coarser" fallback). "Smallest" shows every leaf.

| Provider | Level 0 (normal + coarser) | Level 1 (normal + coarser) | Level 2 (normal + coarser) | Level 3 (normal + coarser) | Smallest |
| --- | --- | --- | --- | --- | --- |
| geofabrik | 8 + 0 | 194 + 1 | 268 + 177 | 74 + 438 | 512 |
| osmfr | 7 + 0 | 197 + 0 | 564 + 156 | 426 + 660 | 1086 |

## Top-level entries

- **geofabrik**: Africa, Antarctica (leaf), Asia, Australia and Oceania, Central America, Europe, North America, Russian Federation, South America.
  - Not continents: Russian Federation (10 children).
- **osmfr**: Africa, Asia, Central America, Europe, North America, Oceania, Russia, South America.
  - Not continents: Russia (8 children).

## Leaves that contain other leaves

Pairs where at least 90% of a smaller leaf's boundary vertices fall inside a larger leaf of the same provider (bundles left out). Each one draws on top of the other in the "smallest available" view. Enclaves (a city inside its surrounding region) are expected; a long list under one extract suggests a missing parent link or an unflagged bundle.

### geofabrik: 13 containing leaves

- `guangdong` (depth 2) contains 2: `hong-kong`, `macau`
- `hebei` (depth 2) contains 2: `beijing`, `tianjin`
- `morocco` (depth 1) contains 2: `ceuta`, `melilla`
- `brandenburg` (depth 2) contains 1: `berlin`
- `new-south-wales` (depth 2) contains 1: `act`
- `niedersachsen` (depth 2) contains 1: `bremen`
- `northwestern-fed-district` (depth 2) contains 1: `kaliningrad`
- `nusa-tenggara` (depth 2) contains 1: `east-timor`
- `provence-alpes-cote-d-azur` (depth 2) contains 1: `monaco`
- `south-africa` (depth 1) contains 1: `lesotho`
- `stredocesky` (depth 2) contains 1: `praha`
- `ukraine` (depth 1) contains 1: `crimean-fed-district`
- `us/virginia` (depth 2) contains 1: `us/district-of-columbia`

### osmfr: 24 containing leaves

- `asia/indonesia/papua` (depth 2) contains 3: `asia/indonesia/central_papua`, `asia/indonesia/highland_papua`, `asia/indonesia/south_papua`
- `africa/morocco` (depth 1) contains 2: `africa/spain/ceuta`, `africa/spain/melilla`
- `asia/china/guangdong` (depth 2) contains 2: `asia/china/hong_kong`, `asia/china/macau`
- `asia/china/hebei` (depth 2) contains 2: `asia/china/beijing`, `asia/china/tianjin`
- `europe/switzerland/saint_gallen` (depth 2) contains 2: `europe/switzerland/appenzell_ausserrhoden`, `europe/switzerland/appenzell_innerrhoden`
- `africa/south_sudan` (depth 1) contains 1: `africa/ilemi`
- `africa/sudan` (depth 1) contains 1: `africa/bir_tawil`
- `asia/india/gujarat` (depth 2) contains 1: `asia/india/daman_and_diu`
- `asia/india/punjab` (depth 2) contains 1: `asia/india/chandigarh`
- `asia/indonesia/central_java` (depth 2) contains 1: `asia/indonesia/yogyakarta`
- `asia/indonesia/west_papua` (depth 2) contains 1: `asia/indonesia/southwest_papua`
- `asia/malaysia` (depth 1) contains 1: `asia/brunei`
- `europe/austria/niederosterreich` (depth 2) contains 1: `europe/austria/wien`
- `europe/belgium/flanders/flemish_brabant` (depth 3) contains 1: `europe/belgium/brussels_capital_region`
- `europe/czech_republic/stredocesky` (depth 2) contains 1: `europe/czech_republic/praha`
- `europe/italy/emilia_romagna` (depth 2) contains 1: `europe/san_marino`
- `europe/italy/lazio` (depth 2) contains 1: `europe/vatican_city`
- `europe/norway/akershus` (depth 2) contains 1: `europe/norway/oslo`
- `europe/ukraine/kiev_oblast` (depth 2) contains 1: `europe/ukraine/kiev`
- `north-america/mexico/state_of_mexico` (depth 2) contains 1: `north-america/mexico/mexico_city`
- `russia/central_federal_district/moscow_oblast` (depth 3) contains 1: `russia/central_federal_district/moscow`
- `russia/northwestern_federal_district/leningrad_oblast` (depth 3) contains 1: `russia/northwestern_federal_district/saint_petersburg`
- `russia/southern_federal_district/krasnodar_krai` (depth 3) contains 1: `russia/southern_federal_district/adygea_republic`
- `south-america/brazil/central-west/goias` (depth 3) contains 1: `south-america/brazil/central-west/distrito-federal`

## Sample trees

`▾` has children, `·` is a leaf, `[n]` is depth, then the estimated size (`?` = not known yet).

### Canada

```
Geofabrik                                        OSM-FR
▾ Canada [1] ?                                   ▾ Canada [1] 6.0 GB
  · Alberta [2] 335 MB                             · Alberta [2] 356 MB
  ▾ British Columbia [2] 1.2 GB                    · British Columbia [2] 1.0 GB
    · Interior Administrative Region [3] ?         · Manitoba [2] 210 MB
    · Island Administrative Region [3] ?           · New Brunswick [2] 67 MB
    · Kootenay Administrative Region [3] ?         · Newfoundland and Labrador [2] 259 MB
    · North Administrative Region [3] ?            · Northwest Territories [2] 472 MB
    · Okanagan Administrative Region [3] ?         · Nova Scotia [2] 100 MB
    · South Coast Administrative Region [3] ?      · Nunavut [2] 1.0 GB
  · Manitoba [2] 210 MB                            ▾ Ontario [2] 1020 MB
  · New Brunswick [2] 63 MB                          · Central Ontario [3] 87 MB
  · Newfoundland and Labrador [2] 247 MB             · Eastern Ontario [3] 116 MB
  · Northwest Territories [2] 391 MB                 · Golden Horseshoe [3] 167 MB
  · Nova Scotia [2] 94 MB                            · Northeastern Ontario [3] 245 MB
  ▾ Nunavut [2] 1.4 GB                               · Northwestern Ontario [3] 306 MB
    · Kitikmeot Region [3] ?                         · Southwestern Ontario [3] 109 MB
    · Kivalliq Region [3] ?                        · Prince Edward Island [2] 15 MB
    · Qikiqtaaluk Region [3] ?                     ▾ Quebec [2] 1.0 GB
  · Ontario [2] 978 MB                               · Abitibi Temiscamingue [3] 41 MB
  · Prince Edward Island [2] 11 MB                   · Bas Saint Laurent [3] 21 MB
  · Quebec [2] 1.1 GB                                · Capitale Nationale [3] 32 MB
  · Saskatchewan [2] 112 MB                          · Centre du Quebec [3] 18 MB
  · Yukon [2] 67 MB                                  · Chaudiere Appalaches [3] 28 MB
                                                     · Cote Nord [3] 117 MB
                                                     · Estrie [3] 32 MB
                                                     · Gaspesie Iles de la Madeleine [3] 15 MB
                                                     · Lanaudiere [3] 23 MB
                                                     · Laurentides [3] 40 MB
                                                     · Laval [3] 9 MB
                                                     · Mauricie [3] 35 MB
                                                     · Monteregie [3] 52 MB
                                                     · Montreal [3] 42 MB
                                                     · Nord du Quebec [3] 583 MB
                                                     · Outaouais [3] 48 MB
                                                     · Saguenay Lac Saint Jean [3] 51 MB
                                                   · Saskatchewan [2] 114 MB
                                                   · Yukon [2] 71 MB
```

### France

```
Geofabrik                               OSM-FR
▾ France [1] ?                          ▾ France [1] 5.0 GB
  · Alsace [2] ?                          ▾ Alsace [2] 155 MB
  · Aquitaine [2] ?                         · Bas Rhin [3] 89 MB
  · Auvergne [2] ?                          · Haut Rhin [3] 59 MB
  · Basse-Normandie [2] ?                 ▾ Aquitaine [2] 322 MB
  · Bourgogne [2] ?                         · Dordogne [3] 57 MB
  · Bretagne [2] ?                          · Gironde [3] 103 MB
  · Centre [2] ?                            · Landes [3] 54 MB
  · Champagne Ardenne [2] ?                 · Lot et Garonne [3] 40 MB
  · Corse [2] ?                             · Pyrenees Atlantiques [3] 77 MB
  · Franche Comte [2] ?                   ▾ Auvergne [2] 173 MB
  · Guadeloupe [2] ?                        · Allier [3] 43 MB
  · Guyane [2] ?                            · Cantal [3] 27 MB
  · Haute-Normandie [2] ?                   · Haute Loire [3] 38 MB
  · Ile-de-France [2] ?                     · Puy de Dome [3] 72 MB
  · Languedoc-Roussillon [2] ?            ▾ Basse Normandie [2] 157 MB
  · Limousin [2] ?                          · Calvados [3] 74 MB
  · Lorraine [2] ?                          · Manche [3] 54 MB
  · Martinique [2] ?                        · Orne [3] 36 MB
  · Mayotte [2] ?                         ▾ Bourgogne [2] 220 MB
  · Midi-Pyrenees [2] ?                     · Cote d'Or [3] 51 MB
  · Nord-Pas-de-Calais [2] ?                · Nievre [3] 33 MB
  · Pays de la Loire [2] ?                  · Saone et Loire [3] 102 MB
  · Picardie [2] ?                          · Yonne [3] 45 MB
  · Poitou-Charentes [2] ?                ▾ Bretagne [2] 352 MB
  · Provence Alpes-Cote-d'Azur [2] ?        · Cotes d'Armor [3] 76 MB
  · Reunion [2] ?                           · Finistere [3] 105 MB
  · Rhone-Alpes [2] ?                       · Ille et Vilaine [3] 105 MB
                                            · Morbihan [3] 80 MB
                                          ▾ Centre [2] 270 MB
                                            · Cher [3] 34 MB
                                            · Eure et Loir [3] 33 MB
                                            · Indre [3] 40 MB
                                            · Indre et Loire [3] 74 MB
                                            · Loir et Cher [3] 42 MB
                                            · Loiret [3] 59 MB
                                          ▾ Champagne Ardenne [2] 116 MB
                                            · Ardennes [3] 26 MB
                                            · Aube [3] 28 MB
                                            · Haute Marne [3] 24 MB
                                            · Marne [3] 42 MB
                                          ▾ Corse [2] 37 MB
                                            · Corse du Sud [3] 19 MB
                                            · Haute Corse [3] 19 MB
                                          ▾ Franche Comte [2] 141 MB
                                            · Doubs [3] 55 MB
                                            · Haute Saone [3] 31 MB
                                            · Jura [3] 48 MB
                                            · Territoire de Belfort [3] 16 MB
                                          ▾ Haute Normandie [2] 117 MB
                                            · Eure [3] 45 MB
                                            · Seine Maritime [3] 77 MB
                                          ▾ Ile de France [2] 370 MB
                                            · Essonne [3] 58 MB
                                            · Hauts de Seine [3] 38 MB
                                            · Paris [3] 46 MB
                                            · Seine et Marne [3] 82 MB
                                            · Seine Saint Denis [3] 39 MB
                                            · Val d'Oise [3] 43 MB
                                            · Val de Marne [3] 40 MB
                                            · Yvelines [3] 58 MB
                                          ▾ Languedoc Roussillon [2] 298 MB
                                            · Aude [3] 49 MB
                                            · Gard [3] 77 MB
                                            · Herault [3] 108 MB
                                            · Lozere [3] 22 MB
                                            · Pyrenees Orientales [3] 54 MB
                                          ▾ Limousin [2] 110 MB
                                            · Correze [3] 37 MB
                                            · Creuse [3] 35 MB
                                            · Haute Vienne [3] 44 MB
                                          ▾ Lorraine [2] 196 MB
                                            · Meurthe et Moselle [3] 55 MB
                                            · Meuse [3] 23 MB
                                            · Moselle [3] 85 MB
                                            · Vosges [3] 44 MB
                                          ▾ Midi Pyrenees [2] 395 MB
                                            · Ariege [3] 29 MB
                                            · Aveyron [3] 65 MB
                                            · Gers [3] 51 MB
                                            · Haute Garonne [3] 112 MB
                                            · Hautes Pyrenees [3] 47 MB
                                            · Lot [3] 38 MB
                                            · Tarn [3] 46 MB
                                            · Tarn et Garonne [3] 33 MB
                                          ▾ Nord Pas de Calais [2] 259 MB
                                            · Nord [3] 170 MB
                                            · Pas de Calais [3] 107 MB
                                          ▾ Pays de la Loire [2] 405 MB
                                            · Loire Atlantique [3] 134 MB
                                            · Maine et Loire [3] 84 MB
                                            · Mayenne [3] 35 MB
                                            · Sarthe [3] 57 MB
                                            · Vendee [3] 114 MB
                                          ▾ Picardie [2] 150 MB
                                            · Aisne [3] 47 MB
                                            · Oise [3] 62 MB
                                            · Somme [3] 47 MB
                                          ▾ Poitou Charentes [2] 249 MB
                                            · Charente [3] 45 MB
                                            · Charente Maritime [3] 89 MB
                                            · Deux Sevres [3] 66 MB
                                            · Vienne [3] 59 MB
                                          ▾ Provence Alpes Cote d'Azur [2] 427 MB
                                            · Alpes de Haute Provence [3] 45 MB
                                            · Alpes Maritimes [3] 66 MB
                                            · Bouches du Rhone [3] 123 MB
                                            · Hautes Alpes [3] 43 MB
                                            · Var [3] 79 MB
                                            · Vaucluse [3] 92 MB
                                          ▾ Rhone Alpes [2] 591 MB
                                            · Ain [3] 79 MB
                                            · Ardeche [3] 59 MB
                                            · Drome [3] 72 MB
                                            · Haute Savoie [3] 91 MB
                                            · Isere [3] 118 MB
                                            · Loire [3] 62 MB
                                            · Rhone [3] 93 MB
                                            · Savoie [3] 63 MB
```

### USA

```
Geofabrik                             OSM-FR
north-america › us*                   north-america › us*
  ▾ United States of America [1] ?      ▾ US Midwest [1] 3.0 GB
    · Alabama [2] ?                       ▾ Illinois [2] 382 MB
    · Alaska [2] ?                          · Central [3] 46 MB
    · Arizona [2] ?                         · Cook [3] 119 MB
    · Arkansas [2] ?                        · East Central [3] 33 MB
    ▾ California [2] ?                      · North [3] 71 MB
      · Northern California [3] ?           · Northeast [3] 51 MB
      · Southern California [3] ?           · Northwest [3] 18 MB
    · Colorado [2] ?                        · Southern [3] 20 MB
    · Connecticut [2] ?                     · Southwest [3] 24 MB
    · Delaware [2] ?                      ▾ Michigan [2] 332 MB
    · District of Columbia [2] ?            · Central [3] 29 MB
    · Florida [2] ?                         · Detroit Metro [3] 123 MB
    · Georgia [2] ?                         · Northern Lower [3] 33 MB
    · Hawaii [2] ?                          · Southeast [3] 33 MB
    · Idaho [2] ?                           · Southwest [3] 25 MB
    · Illinois [2] ?                        · Upper Peninsula [3] 43 MB
    · Indiana [2] ?                         · West [3] 39 MB
    · Iowa [2] ?                        ▾ US Northeast [1] 2.0 GB
    · Kansas [2] ?                        ▾ New York [2] 515 MB
    · Kentucky [2] ?                        · Capital District [3] 43 MB
    · Louisiana [2] ?                       · Central New York [3] 33 MB
    · Maine [2] ?                           · Finger Lakes [3] 35 MB
    · Maryland [2] ?                        · Hudson Valley [3] 79 MB
    · Massachusetts [2] ?                   · Long Island [3] 101 MB
    · Michigan [2] ?                        · Mohawk Valley [3] 19 MB
    · Minnesota [2] ?                       · New York City [3] 96 MB
    · Mississippi [2] ?                     · North Country [3] 27 MB
    · Missouri [2] ?                        · Southern Tier [3] 30 MB
    · Montana [2] ?                         · Western New York [3] 53 MB
    · Nebraska [2] ?                    ▾ US South [1] 4.0 GB
    · Nevada [2] ?                        ▾ Florida [2] 680 MB
    · New Hampshire [2] ?                   · East Central [3] 122 MB
    · New Jersey [2] ?                      · Gatorland [3] 41 MB
    · New Mexico [2] ?                      · Gold Coast [3] 129 MB
    · New York [2] ?                        · Northeast [3] 63 MB
    · North Carolina [2] ?                  · Northwest [3] 48 MB
    · North Dakota [2] ?                    · Panhandle [3] 60 MB
    · Ohio [2] ?                            · Southwest [3] 61 MB
    · Oklahoma [2] ?                        · Suncoast [3] 135 MB
    · Oregon [2] ?                          · Treasure Coast [3] 26 MB
    · Pennsylvania [2] ?                  ▾ Georgia [2] 373 MB
    · Puerto Rico [2] ?                     · North Metro [3] 59 MB
    · Rhode Island [2] ?                    · Northeast [3] 83 MB
    · South Carolina [2] ?                  · Northwest [3] 121 MB
    · South Dakota [2] ?                    · Southeast [3] 72 MB
    · Tennessee [2] ?                       · Southwest [3] 34 MB
    · Texas [2] ?                         ▾ North Carolina [2] 458 MB
    · US Virgin Islands [2] ?               · North Central [3] 106 MB
    · Utah [2] ?                            · Northeast [3] 31 MB
    · Vermont [2] ?                         · Northwest [3] 35 MB
    · Virginia [2] ?                        · Piedmont Triad [3] 62 MB
    · Washington [2] ?                      · South Central [3] 118 MB
    · West Virginia [2] ?                   · Southeast [3] 41 MB
    · Wisconsin [2] ?                       · Western [3] 48 MB
    · Wyoming [2] ?                       ▾ Texas [2] 774 MB
  · US Midwest [1] ?                        · Central [3] 179 MB
  · US Northeast [1] ?                      · North [3] 56 MB
  · US Pacific [1] ?                        · Northwest [3] 260 MB
  · US South [1] ?                          · South [3] 43 MB
  · US West [1] ?                           · Southeast [3] 163 MB
                                            · West [3] 45 MB
                                          ▾ Virginia [2] 445 MB
                                            · Appomattox [3] 45 MB
                                            · Chesapeake [3] 85 MB
                                            · Culpeper [3] 44 MB
                                            · Fairfax [3] 76 MB
                                            · Richmond [3] 74 MB
                                            · Salem [3] 52 MB
                                            · Wytheville [3] 32 MB
                                        ▾ US West [1] 4.0 GB
                                          ▾ California [2] 1.0 GB
                                            · Alameda [3] 45 MB
                                            · Alpine [3] 2 MB
                                            · Amador [3] 2 MB
                                            · Butte [3] 9 MB
                                            · Calaveras [3] 6 MB
                                            · Colusa [3] 3 MB
                                            · Contra Costa [3] 26 MB
                                            · Del Norte [3] 5 MB
                                            · El Dorado [3] 10 MB
                                            · Fresno [3] 49 MB
                                            · Glenn [3] 3 MB
                                            · Humboldt [3] 15 MB
                                            · Imperial [3] 5 MB
                                            · Inyo [3] 12 MB
                                            · Kern [3] 53 MB
                                            · Kings [3] 4 MB
                                            · Lake [3] 4 MB
                                            · Lassen [3] 11 MB
                                            · Los Angeles [3] 319 MB
                                            · Madera [3] 17 MB
                                            · Marin [3] 13 MB
                                            · Mariposa [3] 7 MB
                                            · Mendocino [3] 9 MB
                                            · Merced [3] 12 MB
                                            · Modoc [3] 12 MB
                                            · Mono [3] 8 MB
                                            · Monterey [3] 24 MB
                                            · Napa [3] 6 MB
                                            · Nevada [3] 11 MB
                                            · Orange [3] 92 MB
                                            · Placer [3] 22 MB
                                            · Plumas [3] 14 MB
                                            · Riverside [3] 49 MB
                                            · Sacramento [3] 29 MB
                                            · San Benito [3] 9 MB
                                            · San Bernardino [3] 47 MB
                                            · San Diego [3] 91 MB
                                            · San Francisco [3] 20 MB
                                            · San Joaquin [3] 19 MB
                                            · San Luis Obispo [3] 27 MB
                                            · San Mateo [3] 27 MB
                                            · Santa Barbara [3] 17 MB
                                            · Santa Clara [3] 74 MB
                                            · Santa Cruz [3] 12 MB
                                            · Shasta [3] 23 MB
                                            · Sierra [3] 7 MB
                                            · Siskiyou [3] 21 MB
                                            · Solano [3] 15 MB
                                            · Sonoma [3] 29 MB
                                            · Stanislaus [3] 13 MB
                                            · Sutter [3] 2 MB
                                            · Tehama [3] 15 MB
                                            · Trinity [3] 16 MB
                                            · Tulare [3] 20 MB
                                            · Tuolumne [3] 8 MB
                                            · Ventura [3] 24 MB
                                            · Yolo [3] 10 MB
                                            · Yuba [3] 3 MB
                                          ▾ Colorado [2] 397 MB
                                            · Denver [3] 114 MB
                                            · Northeast [3] 68 MB
                                            · Northwest [3] 106 MB
                                            · Southeast [3] 59 MB
                                            · Southwest [3] 60 MB
```

### Germany

```
Geofabrik                                  OSM-FR
▾ Germany [1] ?                            ▾ Germany [1] 6.0 GB
  ▾ Baden-Württemberg [2] ?                  ▾ Nordrhein Westfalen [2] 1.0 GB
    · Regierungsbezirk Freiburg [3] ?          · Arnsberg [3] 233 MB
    · Regierungsbezirk Karlsruhe [3] ?         · Detmold [3] 160 MB
    · Regierungsbezirk Stuttgart [3] ?         · Dusseldorf [3] 262 MB
    · Regierungsbezirk Tübingen [3] ?          · Koln [3] 273 MB
  ▾ Bayern [2] ?                               · Munster [3] 179 MB
    · Mittelfranken [3] ?
    · Niederbayern [3] ?
    · Oberbayern [3] ?
    · Oberfranken [3] ?
    · Oberpfalz [3] ?
    · Schwaben [3] ?
    · Unterfranken [3] ?
  · Berlin [2] ?
  · Brandenburg (mit Berlin) [2] ?
  · Bremen [2] ?
  · Hamburg [2] ?
  · Hessen [2] ?
  · Mecklenburg-Vorpommern [2] ?
  · Niedersachsen (mit Bremen) [2] ?
  ▾ Nordrhein-Westfalen [2] ?
    · Regierungsbezirk Arnsberg [3] ?
    · Regierungsbezirk Detmold [3] ?
    · Regierungsbezirk Düsseldorf [3] ?
    · Regierungsbezirk Köln [3] ?
    · Regierungsbezirk Münster [3] ?
  · Rheinland-Pfalz [2] ?
  · Saarland [2] ?
  · Sachsen [2] ?
  · Sachsen-Anhalt [2] ?
  · Schleswig-Holstein [2] ?
  · Thüringen [2] ?
```

### Russia

```
Geofabrik                                    OSM-FR
▾ Russian Federation [1] ?                   ▾ Russia [1] 4.0 GB
  · Central Federal District [2] ?             ▾ Central Federal District [2] 940 MB
  · Crimean Federal District [2] ?               · Belgorod Oblast [3] 40 MB
  · Far Eastern Federal District [2] ?           · Bryansk Oblast [3] 30 MB
  · Kaliningrad [2] ?                            · Ivanovo Oblast [3] 22 MB
  · North Caucasus Federal District [2] ?        · Kaluga Oblast [3] 44 MB
  · Northwestern Federal District [2] ?          · Kostroma Oblast [3] 23 MB
  · Siberian Federal District [2] ?              · Kursk Oblast [3] 46 MB
  · South Federal District [2] ?                 · Lipetsk Oblast [3] 36 MB
  · Ural Federal District [2] ?                  · Moscow [3] 106 MB
  · Volga Federal District [2] ?                 · Moscow Oblast [3] 231 MB
                                                 · Oryol Oblast [3] 19 MB
                                                 · Ryazan Oblast [3] 35 MB
                                                 · Smolensk Oblast [3] 42 MB
                                                 · Tambov Oblast [3] 37 MB
                                                 · Tula Oblast [3] 34 MB
                                                 · Tver Oblast [3] 76 MB
                                                 · Vladimir Oblast [3] 55 MB
                                                 · Voronezh Oblast [3] 63 MB
                                                 · Yaroslavl Oblast [3] 43 MB
                                               ▾ Far Eastern Federal District [2] 401 MB
                                                 · Amur Oblast [3] 21 MB
                                                 · Chukotka Autonomous Okrug [3] 56 MB
                                                 · Jewish Autonomous Oblast [3] 7 MB
                                                 · Kamchatka Krai [3] 31 MB
                                                 · Khabarovsk Krai [3] 75 MB
                                                 · Magadan Oblast [3] 10 MB
                                                 · Primorsky Krai [3] 56 MB
                                                 · Sakha Republic [3] 104 MB
                                                 · Sakhalin Oblast [3] 39 MB
                                               ▾ North Caucasian Federal District [2] 133 MB
                                                 · Chechen Republic [3] 11 MB
                                                 · Dagestan Republic [3] 38 MB
                                                 · Ingushetia Republic [3] 4 MB
                                                 · Kabardino Balkar Republic [3] 19 MB
                                                 · Karachay Cherkess Republic [3] 18 MB
                                                 · North Ossetia Alania Republic [3] 8 MB
                                                 · Stavropol Krai [3] 38 MB
                                               ▾ Northwestern Federal District [2] 683 MB
                                                 · Arkhangelsk Oblast [3] 80 MB
                                                 · Kaliningrad Oblast [3] 32 MB
                                                 · Karelia Republic [3] 104 MB
                                                 · Komi Republic [3] 55 MB
                                                 · Leningrad Oblast [3] 191 MB
                                                 · Murmansk Oblast [3] 50 MB
                                                 · Nenets Autonomous Okrug [3] 21 MB
                                                 · Novgorod Oblast [3] 28 MB
                                                 · Pskov Oblast [3] 53 MB
                                                 · Saint Petersburg [3] 73 MB
                                                 · Vologda Oblast [3] 50 MB
                                               ▾ Siberian Federal District [2] 600 MB
                                                 · Altai Krai [3] 115 MB
                                                 · Altai Republic [3] 63 MB
                                                 · Buryatia Republic [3] 24 MB
                                                 · Irkutsk Oblast [3] 68 MB
                                                 · Kemerovo Oblast [3] 36 MB
                                                 · Khakassia Republic [3] 13 MB
                                                 · Krasnoyarsk Krai [3] 100 MB
                                                 · Novosibirsk Oblast [3] 68 MB
                                                 · Omsk Oblast [3] 60 MB
                                                 · Tomsk Oblast [3] 29 MB
                                                 · Tuva Republic [3] 10 MB
                                                 · Zabaykalsky Krai [3] 23 MB
                                               ▾ Southern Federal District [2] 332 MB
                                                 · Adygea Republic [3] 22 MB
                                                 · Astrakhan Oblast [3] 17 MB
                                                 · Crimea Republic [3] 253 KB
                                                 · Kalmykia Republic [3] 8 MB
                                                 · Krasnodar Krai [3] 157 MB
                                                 · Rostov Oblast [3] 88 MB
                                                 · Sevastopol [3] 26 KB
                                                 · Volgograd Oblast [3] 61 MB
                                               ▾ Ural Federal District [2] 412 MB
                                                 · Chelyabinsk Oblast [3] 85 MB
                                                 · Khanty Mansi Autonomous Okrug [3] 111 MB
                                                 · Kurgan Oblast [3] 29 MB
                                                 · Sverdlovsk Oblast [3] 100 MB
                                                 · Tyumen Oblast [3] 45 MB
                                                 · Yamalo Nenets Autonomous Okrug [3] 39 MB
                                               ▾ Volga Federal District [2] 809 MB
                                                 · Bashkortostan Republic [3] 94 MB
                                                 · Chuvash Republic [3] 27 MB
                                                 · Kirov Oblast [3] 120 MB
                                                 · Mari El Republic [3] 27 MB
                                                 · Mordovia Republic [3] 28 MB
                                                 · Nizhny Novgorod Oblast [3] 74 MB
                                                 · Orenburg Oblast [3] 47 MB
                                                 · Penza Oblast [3] 31 MB
                                                 · Perm Krai [3] 91 MB
                                                 · Samara Oblast [3] 55 MB
                                                 · Saratov Oblast [3] 47 MB
                                                 · Tatarstan Republic [3] 92 MB
                                                 · Udmurt Republic [3] 49 MB
                                                 · Ulyanovsk Oblast [3] 38 MB
```

### Small countries

```
Geofabrik                       OSM-FR
· Monaco [1] ?                  · Monaco [1] 1 MB
· Luxembourg [1] ?              · Luxembourg [1] 54 MB
· Andorra [1] ?                 · Andorra [1] 4 MB
· Malta [1] ?                   (no europe/malta)
· Liechtenstein [1] ?           (no europe/liechtenstein)
· Iceland [1] ?                 (no europe/iceland)
```

## Boundary file sizes

| File | Raw | Gzipped | Features | Vertices | Leaf vertices | Largest feature |
| --- | --- | --- | --- | --- | --- | --- |
| `boundaries-geofabrik.geojson` | 2.9 MB | 1.1 MB | 554 | 146,050 | 134,884 | 2,016 |
| `boundaries-osmfr.geojson` | 6.4 MB | 1.6 MB | 1196 | 416,182 | 366,488 | 2,392 |
| `extracts.json` | 1.1 MB | 0.1 MB | 1750 | — | — | — |
