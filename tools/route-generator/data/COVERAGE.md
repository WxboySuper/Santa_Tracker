# Candidate coverage audit

Snapshot audit for the inhabited ISO 3166-1 country and territory pool. Coordinates are checked against `country-bounds.json`; IANA offsets are calculated for 2026-12-25 UTC, which is within the Dec 24-25 local visit window in the sweep spec. 

The initial pool was missing 27 ISO codes. The refresh now has a candidate for 22 of those, including all three inhabited Caribbean Netherlands islands and Saint-Pierre. The remaining five codes plus Antarctica have no permanent civilian population and are listed as exclusions. That leaves 244 covered codes out of 250 ISO entries.

| ISO | Country or territory | Candidate | Latitude, longitude | IANA timezone (Dec 25 offset) | Status |
|---|---|---|---|---|---|
| AD | Andorra | Andorra | 42.5108, 1.5266 | Europe/Andorra (+60 min) | Covered |
| AE | United Arab Emirates | Dubai | 25.2149, 55.2869 | Asia/Dubai (+240 min) | Covered |
| AF | Afghanistan | Kabul | 34.5186, 69.1813 | Asia/Kabul (+270 min) | Covered |
| AG | Antigua & Barbuda | Saint John's | 17.1180, -61.8500 | America/Antigua (-240 min) | Covered |
| AI | Anguilla | [The Valley](https://www.wikidata.org/wiki/Q30994) | 18.2208, -63.0517 | America/Anguilla (-240 min) | Covered |
| AL | Albania | Tirana | 41.3275, 19.8189 | Europe/Tirane (+60 min) | Covered |
| AM | Armenia | Yerevan | 40.1831, 44.5116 | Asia/Yerevan (+240 min) | Covered |
| AO | Angola | Luanda | -8.8363, 13.2325 | Africa/Luanda (+60 min) | Covered |
| AQ | Antarctica | ? | ? | ? | Excluded. Antarctica has no permanent civilian population. |
| AR | Argentina | Buenos Aires | -34.6107, -58.4325 | America/Argentina/Buenos_Aires (-180 min) | Covered |
| AS | American Samoa | Pago Pago | -14.2766, -170.7066 | Pacific/Pago_Pago (-660 min) | Covered |
| AT | Austria | Vienna | 48.2020, 16.3647 | Europe/Vienna (+60 min) | Covered |
| AU | Australia | Sydney | -33.8714, 151.2125 | Australia/Sydney (+660 min) | Covered |
| AW | Aruba | Oranjestad | 12.5215, -70.0255 | America/Aruba (-240 min) | Covered |
| AX | Åland Islands | Mariehamn | 60.0970, 19.9490 | Europe/Mariehamn (+120 min) | Covered |
| AZ | Azerbaijan | Baku | 40.3972, 49.8603 | Asia/Baku (+240 min) | Covered |
| BA | Bosnia & Herzegovina | Sarajevo | 43.8500, 18.3830 | Europe/Sarajevo (+60 min) | Covered |
| BB | Barbados | Bridgetown | 13.1020, -59.6165 | America/Barbados (-240 min) | Covered |
| BD | Bangladesh | Dhaka | 23.7250, 90.4066 | Asia/Dhaka (+360 min) | Covered |
| BE | Belgium | Brussels | 50.8353, 4.3314 | Europe/Brussels (+60 min) | Covered |
| BF | Burkina Faso | Ouagadougou | 12.3723, -1.5267 | Africa/Ouagadougou (+0 min) | Covered |
| BG | Bulgaria | Sofia | 42.6853, 23.3147 | Europe/Sofia (+120 min) | Covered |
| BH | Bahrain | Manama | 26.2361, 50.5831 | Asia/Bahrain (+180 min) | Covered |
| BI | Burundi | Bujumbura | -3.3761, 29.3600 | Africa/Bujumbura (+120 min) | Covered |
| BJ | Benin | Cotonou | 6.3630, 2.4044 | Africa/Porto-Novo (+60 min) | Covered |
| BL | St. Barthélemy | [Gustavia](https://www.wikidata.org/wiki/Q34112) | 17.8986, -62.8492 | America/St_Barthelemy (-240 min) | Covered |
| BM | Bermuda | Hamilton | 32.2942, -64.7839 | Atlantic/Bermuda (-240 min) | Covered |
| BN | Brunei | Bandar Seri Begawan | 4.8833, 114.9333 | Asia/Brunei (+480 min) | Covered |
| BO | Bolivia | Santa Cruz | -17.7520, -63.2279 | America/La_Paz (-240 min) | Covered |
| BQ | Caribbean Netherlands | [Kralendijk, Oranjestad, The Bottom](https://www.wikidata.org/wiki/Q331584) | 12.1508, -68.2767 | America/Kralendijk (-240 min) | Covered |
| BR | Brazil | São Paulo | -23.5567, -46.6270 | America/Sao_Paulo (-180 min) | Covered |
| BS | Bahamas | Nassau | 25.0834, -77.3500 | America/Nassau (-300 min) | Covered |
| BT | Bhutan | Thimphu | 27.4730, 89.6390 | Asia/Thimphu (+360 min) | Covered |
| BV | Bouvet Island | ? | ? | ? | Excluded. Bouvet Island is uninhabited. |
| BW | Botswana | Gaborone | -24.6463, 25.9119 | Africa/Gaborone (+120 min) | Covered |
| BY | Belarus | Minsk | 53.9019, 27.5647 | Europe/Minsk (+180 min) | Covered |
| BZ | Belize | Belize City | 17.4987, -88.1884 | America/Belize (-360 min) | Covered |
| CA | Canada | Toronto | 43.6646, -79.3895 | America/Toronto (-300 min) | Covered |
| CC | Cocos (Keeling) Islands | [West Island](https://www.wikidata.org/wiki/Q48675) | -12.1869, 96.8283 | Indian/Cocos (+390 min) | Covered |
| CD | Congo - Kinshasa | Kinshasa | -4.3278, 15.3130 | Africa/Kinshasa (+60 min) | Covered |
| CF | Central African Republic | Bangui | 4.3666, 18.5583 | Africa/Bangui (+60 min) | Covered |
| CG | Congo - Brazzaville | Brazzaville | -4.2572, 15.2827 | Africa/Brazzaville (+60 min) | Covered |
| CH | Switzerland | Geneva | 46.2100, 6.1400 | Europe/Zurich (+60 min) | Covered |
| CI | Côte d’Ivoire | Abidjan | 5.3231, -4.0202 | Africa/Abidjan (+0 min) | Covered |
| CK | Cook Islands | Avarua | -21.1962, -159.7854 | Pacific/Rarotonga (-600 min) | Covered |
| CL | Chile | Santiago | -33.4402, -70.6505 | America/Santiago (-180 min) | Covered |
| CM | Cameroon | Douala | 4.0624, 9.7080 | Africa/Douala (+60 min) | Covered |
| CN | China | Shanghai | 31.2184, 121.4346 | Asia/Shanghai (+480 min) | Covered |
| CO | Colombia | Bogota | 4.5984, -74.0853 | America/Bogota (-300 min) | Covered |
| CR | Costa Rica | San José | 9.9304, -84.0788 | America/Costa_Rica (-360 min) | Covered |
| CU | Cuba | Havana | 23.1339, -82.3661 | America/Havana (-300 min) | Covered |
| CV | Cape Verde | Praia | 14.9167, -23.5167 | Atlantic/Cape_Verde (-60 min) | Covered |
| CW | Curaçao | Willemstad | 12.1123, -68.8724 | America/Curacao (-240 min) | Covered |
| CX | Christmas Island | [Flying Fish Cove](https://www.wikidata.org/wiki/Q30980) | -10.4217, 105.6781 | Indian/Christmas (+420 min) | Covered |
| CY | Cyprus | Nicosia | 35.1667, 33.3666 | Asia/Nicosia (+120 min) | Covered |
| CZ | Czechia | Prague | 50.0870, 14.4229 | Europe/Prague (+60 min) | Covered |
| DE | Germany | Berlin | 52.5238, 13.3996 | Europe/Berlin (+60 min) | Covered |
| DJ | Djibouti | Djibouti | 11.5950, 43.1480 | Africa/Djibouti (+180 min) | Covered |
| DK | Denmark | København | 55.6805, 12.5615 | Europe/Copenhagen (+60 min) | Covered |
| DM | Dominica | Roseau | 15.3010, -61.3870 | America/Dominica (-240 min) | Covered |
| DO | Dominican Republic | Santo Domingo | 18.4707, -69.9297 | America/Santo_Domingo (-240 min) | Covered |
| DZ | Algeria | Algiers | 36.7650, 3.0486 | Africa/Algiers (+60 min) | Covered |
| EC | Ecuador | Guayaquil | -2.2181, -79.9220 | America/Guayaquil (-300 min) | Covered |
| EE | Estonia | Tallinn | 59.4339, 24.7280 | Europe/Tallinn (+120 min) | Covered |
| EG | Egypt | Cairo | 30.0519, 31.2480 | Africa/Cairo (+120 min) | Covered |
| EH | Western Sahara | Bir Lehlou | 26.1192, -9.6525 | Africa/El_Aaiun (+0 min) | Covered |
| ER | Eritrea | Asmara | 15.3333, 38.9333 | Africa/Asmara (+180 min) | Covered |
| ES | Spain | Madrid | 40.4020, -3.6853 | Europe/Madrid (+60 min) | Covered |
| ET | Ethiopia | Addis Ababa | 9.0353, 38.6981 | Africa/Addis_Ababa (+180 min) | Covered |
| FI | Finland | Helsinki | 60.1638, 24.9325 | Europe/Helsinki (+120 min) | Covered |
| FJ | Fiji | Suva | -18.1330, 178.4417 | Pacific/Fiji (+720 min) | Covered |
| FK | Falkland Islands | Stanley | -51.7000, -57.8500 | Atlantic/Stanley (-180 min) | Covered |
| FM | Micronesia | Palikir | 6.9166, 158.1500 | Pacific/Pohnpei (+660 min) | Covered |
| FO | Faroe Islands | Tórshavn | 62.0300, -6.8200 | Atlantic/Faroe (+0 min) | Covered |
| FR | France | Paris | 48.8581, 2.3530 | Europe/Paris (+60 min) | Covered |
| GA | Gabon | Libreville | 0.3854, 9.4580 | Africa/Libreville (+60 min) | Covered |
| GB | United Kingdom | London | 51.5019, -0.1187 | Europe/London (+0 min) | Covered |
| GD | Grenada | Saint George's | 12.0526, -61.7416 | America/Grenada (-240 min) | Covered |
| GE | Georgia | Tbilisi | 41.7270, 44.7888 | Asia/Tbilisi (+240 min) | Covered |
| GF | French Guiana | [Cayenne](https://www.wikidata.org/wiki/Q44401) | 4.9386, -52.3350 | America/Cayenne (-180 min) | Covered |
| GG | Guernsey | [Saint Peter Port](https://www.wikidata.org/wiki/Q174262) | 49.4600, -2.5519 | Europe/Guernsey (+0 min) | Covered |
| GH | Ghana | Accra | 5.5520, -0.2187 | Africa/Accra (+0 min) | Covered |
| GI | Gibraltar | Gibraltar | 36.1283, -5.3460 | Europe/Gibraltar (+60 min) | Covered |
| GL | Greenland | Nuuk | 64.1983, -51.7327 | America/Nuuk (-120 min) | Covered |
| GM | Gambia | Brikama | 13.2804, -16.6599 | Africa/Banjul (+0 min) | Covered |
| GN | Guinea | Conakry | 9.5335, -13.6822 | Africa/Conakry (+0 min) | Covered |
| GP | Guadeloupe | [Basse-Terre](https://www.wikidata.org/wiki/Q167024) | 15.9969, -61.7328 | America/Guadeloupe (-240 min) | Covered |
| GQ | Equatorial Guinea | Bata | 1.8700, 9.7700 | Africa/Malabo (+60 min) | Covered |
| GR | Greece | Athens | 37.9853, 23.7314 | Europe/Athens (+120 min) | Covered |
| GS | South Georgia & South Sandwich Islands | Grytviken | -54.2806, -36.5080 | Atlantic/South_Georgia (-120 min) | Covered |
| GT | Guatemala | Guatemala City | 14.6231, -90.5289 | America/Guatemala (-360 min) | Covered |
| GU | Guam | Agana | 13.4700, 144.7500 | Pacific/Guam (+600 min) | Covered |
| GW | Guinea-Bissau | Bissau | 11.8650, -15.5984 | Africa/Bissau (+0 min) | Covered |
| GY | Guyana | Georgetown | 6.8020, -58.1670 | America/Guyana (-240 min) | Covered |
| HK | Hong Kong SAR China | Hong Kong | 22.3069, 114.1831 | Asia/Hong_Kong (+480 min) | Covered |
| HM | Heard & McDonald Islands | ? | ? | ? | Excluded. Heard Island and McDonald Islands are uninhabited. |
| HN | Honduras | Tegucigalpa | 14.1040, -87.2195 | America/Tegucigalpa (-360 min) | Covered |
| HR | Croatia | Zagreb | 45.8000, 16.0000 | Europe/Zagreb (+60 min) | Covered |
| HT | Haiti | Port-au-Prince | 18.5430, -72.3380 | America/Port-au-Prince (-300 min) | Covered |
| HU | Hungary | Budapest | 47.5020, 19.0814 | Europe/Budapest (+60 min) | Covered |
| ID | Indonesia | Jakarta | -6.1725, 106.8275 | Asia/Jakarta (+420 min) | Covered |
| IE | Ireland | Dublin | 53.3467, -6.2570 | Europe/Dublin (+0 min) | Covered |
| IL | Israel | Tel Aviv | 32.0819, 34.7681 | Asia/Jerusalem (+120 min) | Covered |
| IM | Isle of Man | Douglas | 54.1491, -4.4803 | Europe/Isle_of_Man (+0 min) | Covered |
| IN | India | Mumbai | 19.0684, 72.8758 | Asia/Kolkata (+330 min) | Covered |
| IO | British Indian Ocean Territory | ? | ? | ? | Excluded. The British Indian Ocean Territory has no permanent civilian population. |
| IQ | Iraq | Baghdad | 33.3406, 44.3919 | Asia/Baghdad (+180 min) | Covered |
| IR | Iran | Tehran | 35.6739, 51.4224 | Asia/Tehran (+210 min) | Covered |
| IS | Iceland | Reykjavík | 64.1435, -21.9365 | Atlantic/Reykjavik (+0 min) | Covered |
| IT | Italy | Rome | 41.8979, 12.4813 | Europe/Rome (+60 min) | Covered |
| JE | Jersey | [Saint Helier](https://www.wikidata.org/wiki/Q147738) | 49.1858, -2.1100 | Europe/Jersey (+0 min) | Covered |
| JM | Jamaica | Kingston | 17.9771, -76.7674 | America/Jamaica (-300 min) | Covered |
| JO | Jordan | Amman | 31.9520, 35.9314 | Asia/Amman (+180 min) | Covered |
| JP | Japan | Tokyo | 35.6870, 139.7495 | Asia/Tokyo (+540 min) | Covered |
| KE | Kenya | Nairobi | -1.2814, 36.8147 | Africa/Nairobi (+180 min) | Covered |
| KG | Kyrgyzstan | Bishkek | 42.8750, 74.5833 | Asia/Bishkek (+360 min) | Covered |
| KH | Cambodia | Phnom Penh | 11.5520, 104.9147 | Asia/Phnom_Penh (+420 min) | Covered |
| KI | Kiribati | Tarawa | 1.3382, 173.0176 | Pacific/Tarawa (+720 min) | Covered |
| KM | Comoros | Moroni | -11.7042, 43.2402 | Indian/Comoro (+180 min) | Covered |
| KN | St. Kitts & Nevis | Basseterre | 17.3020, -62.7170 | America/St_Kitts (-240 min) | Covered |
| KP | North Korea | Pyongyang | 39.0214, 125.7527 | Asia/Pyongyang (+540 min) | Covered |
| KR | South Korea | Seoul | 37.5683, 126.9978 | Asia/Seoul (+540 min) | Covered |
| KW | Kuwait | Kuwait City | 29.3717, 47.9764 | Asia/Kuwait (+180 min) | Covered |
| KY | Cayman Islands | George Town | 19.2947, -81.3716 | America/Cayman (-300 min) | Covered |
| KZ | Kazakhstan | Almaty | 43.3269, 76.9131 | Asia/Almaty (+300 min) | Covered |
| LA | Laos | Vientiane | 17.9667, 102.6000 | Asia/Vientiane (+420 min) | Covered |
| LB | Lebanon | Beirut | 33.8739, 35.5078 | Asia/Beirut (+120 min) | Covered |
| LC | St. Lucia | Castries | 14.0079, -60.9929 | America/St_Lucia (-240 min) | Covered |
| LI | Liechtenstein | Vaduz | 47.1337, 9.5167 | Europe/Vaduz (+60 min) | Covered |
| LK | Sri Lanka | Jaffna | 9.6750, 80.0050 | Asia/Colombo (+330 min) | Covered |
| LR | Liberia | Monrovia | 6.3146, -10.7997 | Africa/Monrovia (+0 min) | Covered |
| LS | Lesotho | Maseru | -29.3167, 27.4833 | Africa/Maseru (+120 min) | Covered |
| LT | Lithuania | Vilnius | 54.6834, 25.3166 | Europe/Vilnius (+120 min) | Covered |
| LU | Luxembourg | Luxembourg | 49.6117, 6.1300 | Europe/Luxembourg (+60 min) | Covered |
| LV | Latvia | Riga | 56.9500, 24.1000 | Europe/Riga (+120 min) | Covered |
| LY | Libya | Tripoli | 32.8925, 13.1800 | Africa/Tripoli (+120 min) | Covered |
| MA | Morocco | Casablanca | 33.6019, -7.6183 | Africa/Casablanca (+0 min) | Covered |
| MC | Monaco | Monaco | 43.7396, 7.4069 | Europe/Monaco (+60 min) | Covered |
| MD | Moldova | Chișinău | 47.0050, 28.8577 | Europe/Chisinau (+120 min) | Covered |
| ME | Montenegro | Podgorica | 42.4660, 19.2663 | Europe/Podgorica (+60 min) | Covered |
| MF | St. Martin | [Marigot](https://www.wikidata.org/wiki/Q200605) | 18.0667, -63.0847 | America/Marigot (-240 min) | Covered |
| MG | Madagascar | Antananarivo | -18.9147, 47.5147 | Indian/Antananarivo (+180 min) | Covered |
| MH | Marshall Islands | Majuro | 7.1030, 171.3800 | Pacific/Majuro (+720 min) | Covered |
| MK | North Macedonia | Skopje | 42.0000, 21.4335 | Europe/Skopje (+60 min) | Covered |
| ML | Mali | Bamako | 12.6520, -8.0020 | Africa/Bamako (+0 min) | Covered |
| MM | Myanmar (Burma) | Yangon | 16.7853, 96.1647 | Asia/Yangon (+390 min) | Covered |
| MN | Mongolia | Ulaanbaatar | 47.9186, 106.9147 | Asia/Ulaanbaatar (+480 min) | Covered |
| MO | Macao SAR China | Macau | 22.1891, 113.5444 | Asia/Macau (+480 min) | Covered |
| MP | Northern Mariana Islands | Capitol Hill | 15.2113, 145.7506 | Pacific/Saipan (+600 min) | Covered |
| MQ | Martinique | [Fort-de-France](https://www.wikidata.org/wiki/Q81621) | 14.6000, -61.0667 | America/Martinique (-240 min) | Covered |
| MR | Mauritania | Nouakchott | 18.0864, -15.9753 | Africa/Nouakchott (+0 min) | Covered |
| MS | Montserrat | [Brades](https://www.wikidata.org/wiki/Q31006) | 16.7928, -62.2106 | America/Montserrat (-240 min) | Covered |
| MT | Malta | Valletta | 35.8997, 14.5147 | Europe/Malta (+60 min) | Covered |
| MU | Mauritius | Port Louis | -20.1666, 57.5000 | Indian/Mauritius (+240 min) | Covered |
| MV | Maldives | Malé | 4.1720, 73.5089 | Indian/Maldives (+300 min) | Covered |
| MW | Malawi | Lilongwe | -13.9833, 33.7833 | Africa/Blantyre (+120 min) | Covered |
| MX | Mexico | Guadalajara | 20.6720, -103.3320 | America/Mexico_City (-360 min) | Covered |
| MY | Malaysia | George Town | 5.4136, 100.3294 | Asia/Kuala_Lumpur (+480 min) | Covered |
| MZ | Mozambique | Maputo | -25.9533, 32.5872 | Africa/Maputo (+120 min) | Covered |
| NA | Namibia | Windhoek | -22.5700, 17.0835 | Africa/Windhoek (+120 min) | Covered |
| NC | New Caledonia | Nouméa | -22.2625, 166.4443 | Pacific/Noumea (+660 min) | Covered |
| NE | Niger | Niamey | 13.5187, 2.1147 | Africa/Niamey (+60 min) | Covered |
| NF | Norfolk Island | [Burnt Pine](https://www.wikidata.org/wiki/Q2740764) | -29.0333, 167.9500 | Pacific/Norfolk (+720 min) | Covered |
| NG | Nigeria | Lagos | 6.4452, 3.3896 | Africa/Lagos (+60 min) | Covered |
| NI | Nicaragua | Managua | 12.1550, -86.2704 | America/Managua (-360 min) | Covered |
| NL | Netherlands | The Hague | 52.0800, 4.2700 | Europe/Amsterdam (+60 min) | Covered |
| NO | Norway | Oslo | 59.9186, 10.7480 | Europe/Oslo (+60 min) | Covered |
| NP | Nepal | Kathmandu | 27.7186, 85.3147 | Asia/Kathmandu (+345 min) | Covered |
| NR | Nauru | [Yaren District](https://www.wikidata.org/wiki/Q31026) | -0.5477, 166.9209 | Pacific/Nauru (+720 min) | Covered |
| NU | Niue | Alofi | -19.0660, -169.9136 | Pacific/Niue (-660 min) | Covered |
| NZ | New Zealand | Auckland | -36.8481, 174.7630 | Pacific/Auckland (+780 min) | Covered |
| OM | Oman | Muscat | 23.5852, 58.3783 | Asia/Muscat (+240 min) | Covered |
| PA | Panama | Panama City | 8.9700, -79.5350 | America/Panama (-300 min) | Covered |
| PE | Peru | Lima | -12.0461, -77.0520 | America/Lima (-300 min) | Covered |
| PF | French Polynesia | Papeete | -17.5334, -149.5667 | Pacific/Tahiti (-600 min) | Covered |
| PG | Papua New Guinea | Port Moresby | -9.4647, 147.1925 | Pacific/Port_Moresby (+600 min) | Covered |
| PH | Philippines | Manila | 14.6061, 120.9803 | Asia/Manila (+480 min) | Covered |
| PK | Pakistan | Karachi | 24.8719, 66.9881 | Asia/Karachi (+300 min) | Covered |
| PL | Poland | Katowice | 50.2604, 19.0200 | Europe/Warsaw (+60 min) | Covered |
| PM | St. Pierre & Miquelon | [Saint-Pierre](https://www.wikidata.org/wiki/Q185678) | 46.7778, -56.1778 | America/Miquelon (-180 min) | Covered |
| PN | Pitcairn Islands | [Adamstown](https://www.wikidata.org/wiki/Q48273) | -25.0667, -130.1000 | Pacific/Pitcairn (-480 min) | Covered |
| PR | Puerto Rico | San Juan | 18.4400, -66.1300 | America/Puerto_Rico (-240 min) | Covered |
| PS | Palestinian Territories | Gaza City | 31.5300, 34.4450 | Asia/Gaza (+120 min) | Covered |
| PT | Portugal | Lisbon | 38.7247, -9.1468 | Europe/Lisbon (+0 min) | Covered |
| PW | Palau | Koror | 7.3452, 134.4695 | Pacific/Palau (+540 min) | Covered |
| PY | Paraguay | Asunción | -25.2907, -57.6258 | America/Asuncion (-180 min) | Covered |
| QA | Qatar | Doha | 25.2866, 51.5330 | Asia/Qatar (+180 min) | Covered |
| RE | Réunion | [Saint-Denis](https://www.wikidata.org/wiki/Q47045) | -20.8789, 55.4481 | Indian/Reunion (+240 min) | Covered |
| RO | Romania | Bucharest | 44.4353, 26.0980 | Europe/Bucharest (+120 min) | Covered |
| RS | Serbia | Belgrade | 44.8206, 20.4660 | Europe/Belgrade (+60 min) | Covered |
| RU | Russia | Moscow | 55.7541, 37.6136 | Europe/Moscow (+180 min) | Covered |
| RW | Rwanda | Kigali | -1.9516, 30.0586 | Africa/Kigali (+120 min) | Covered |
| SA | Saudi Arabia | Riyadh | 24.6345, 46.7205 | Asia/Riyadh (+180 min) | Covered |
| SB | Solomon Islands | Honiara | -9.4380, 159.9498 | Pacific/Guadalcanal (+660 min) | Covered |
| SC | Seychelles | Victoria | -4.6166, 55.4500 | Indian/Mahe (+240 min) | Covered |
| SD | Sudan | Khartoum | 15.5900, 32.5322 | Africa/Khartoum (+120 min) | Covered |
| SE | Sweden | Stockholm | 59.3241, 18.0663 | Europe/Stockholm (+60 min) | Covered |
| SG | Singapore | Singapore | 1.2950, 103.8539 | Asia/Singapore (+480 min) | Covered |
| SH | St. Helena | [Jamestown](https://www.wikidata.org/wiki/Q30970) | -15.9251, -5.7179 | Atlantic/St_Helena (+0 min) | Covered |
| SI | Slovenia | Ljubljana | 46.0553, 14.5150 | Europe/Ljubljana (+60 min) | Covered |
| SJ | Svalbard & Jan Mayen | Longyearbyen | 78.2210, 15.6209 | Arctic/Longyearbyen (+60 min) | Covered |
| SK | Slovakia | Bratislava | 48.1500, 17.1170 | Europe/Bratislava (+60 min) | Covered |
| SL | Sierra Leone | Freetown | 8.4720, -13.2362 | Africa/Freetown (+0 min) | Covered |
| SM | San Marino | San Marino | 43.9361, 12.4418 | Europe/San_Marino (+60 min) | Covered |
| SN | Senegal | Dakar | 14.7178, -17.4751 | Africa/Dakar (+0 min) | Covered |
| SO | Somalia | Mogadishu | 2.0686, 45.3647 | Africa/Mogadishu (+180 min) | Covered |
| SR | Suriname | Paramaribo | 5.8350, -55.1670 | America/Paramaribo (-180 min) | Covered |
| SS | South Sudan | Yei | 4.0904, 30.6800 | Africa/Juba (+120 min) | Covered |
| ST | São Tomé & Príncipe | São Tomé | 0.3375, 6.7296 | Africa/Sao_Tome (+0 min) | Covered |
| SV | El Salvador | San Salvador | 13.7033, -89.2156 | America/El_Salvador (-360 min) | Covered |
| SX | Sint Maarten | [Philipsburg](https://www.wikidata.org/wiki/Q30958) | 18.0242, -63.0433 | America/Lower_Princes (-240 min) | Covered |
| SY | Syria | Aleppo | 36.2319, 37.1681 | Asia/Damascus (+180 min) | Covered |
| SZ | Eswatini | Manzini | -26.4950, 31.3880 | Africa/Mbabane (+120 min) | Covered |
| TC | Turks & Caicos Islands | Grand Turk | 21.4664, -71.1360 | America/Grand_Turk (-300 min) | Covered |
| TD | Chad | N'Djamena | 12.1150, 15.0472 | Africa/Ndjamena (+60 min) | Covered |
| TF | French Southern Territories | ? | ? | ? | Excluded. The French Southern Territories have no permanent civilian population. |
| TG | Togo | Lomé | 6.1339, 1.2208 | Africa/Lome (+0 min) | Covered |
| TH | Thailand | Bangkok | 13.7519, 100.5147 | Asia/Bangkok (+420 min) | Covered |
| TJ | Tajikistan | Dushanbe | 38.5600, 68.7739 | Asia/Dushanbe (+300 min) | Covered |
| TK | Tokelau | Atafu | -8.5486, -172.4977 | Pacific/Fakaofo (+780 min) | Covered |
| TL | Timor-Leste | Dili | -8.5594, 125.5795 | Asia/Dili (+540 min) | Covered |
| TM | Turkmenistan | Ashgabat | 37.9500, 58.3833 | Asia/Ashgabat (+300 min) | Covered |
| TN | Tunisia | Tunis | 36.8028, 10.1797 | Africa/Tunis (+60 min) | Covered |
| TO | Tonga | Nuku'alofa | -21.1385, -175.2206 | Pacific/Tongatapu (+780 min) | Covered |
| TR | Türkiye | Istanbul | 41.0176, 28.9743 | Europe/Istanbul (+180 min) | Covered |
| TT | Trinidad & Tobago | Port-of-Spain | 10.6520, -61.5170 | America/Port_of_Spain (-240 min) | Covered |
| TV | Tuvalu | Funafuti | -8.5167, 179.2166 | Pacific/Funafuti (+720 min) | Covered |
| TW | Taiwan | Taipei | 25.0358, 121.5683 | Asia/Taipei (+480 min) | Covered |
| TZ | Tanzania | Dar es Salaam | -6.7981, 39.2664 | Africa/Dar_es_Salaam (+180 min) | Covered |
| UA | Ukraine | Kyiv | 50.4353, 30.5147 | Europe/Kyiv (+120 min) | Covered |
| UG | Uganda | Kampala | 0.3186, 32.5814 | Africa/Kampala (+180 min) | Covered |
| UM | U.S. Outlying Islands | ? | ? | ? | Excluded. The US Minor Outlying Islands have no permanent civilian population. |
| US | United States | New York | 40.7216, -73.9957 | America/New_York (-300 min) | Covered |
| UY | Uruguay | Montevideo | -34.9054, -56.1868 | America/Montevideo (-180 min) | Covered |
| UZ | Uzbekistan | Tashkent | 41.3038, 69.2688 | Asia/Tashkent (+300 min) | Covered |
| VA | Vatican City | Vatican City | 41.9033, 12.4534 | Europe/Vatican (+60 min) | Covered |
| VC | St. Vincent & Grenadines | Kingstown | 13.1558, -61.2202 | America/St_Vincent (-240 min) | Covered |
| VE | Venezuela | Caracas | 10.5029, -66.9190 | America/Caracas (-240 min) | Covered |
| VG | British Virgin Islands | [Road Town](https://www.wikidata.org/wiki/Q179431) | 18.4333, -64.6167 | America/Tortola (-240 min) | Covered |
| VI | U.S. Virgin Islands | Christiansted | 17.7504, -64.7500 | America/St_Thomas (-240 min) | Covered |
| VN | Vietnam | Ho Chi Minh City | 10.7621, 106.7030 | Asia/Ho_Chi_Minh (+420 min) | Covered |
| VU | Vanuatu | Port Vila | -17.7334, 168.3166 | Pacific/Efate (+660 min) | Covered |
| WF | Wallis & Futuna | [Mata-Utu](https://www.wikidata.org/wiki/Q31002) | -13.2827, -176.1737 | Pacific/Wallis (+720 min) | Covered |
| WS | Samoa | Apia | -13.8357, -171.7686 | Pacific/Apia (+780 min) | Covered |
| XK | Kosovo | Pristina | 42.6667, 21.1660 | Europe/Belgrade (+60 min) | Covered |
| YE | Yemen | Sanaa | 15.3567, 44.2046 | Asia/Aden (+180 min) | Covered |
| YT | Mayotte | [Mamoudzou](https://www.wikidata.org/wiki/Q132676) | -12.7814, 45.2317 | Indian/Mayotte (+180 min) | Covered |
| ZA | South Africa | Johannesburg | -26.1681, 28.0281 | Africa/Johannesburg (+120 min) | Covered |
| ZM | Zambia | Lusaka | -15.4147, 28.2814 | Africa/Lusaka (+120 min) | Covered |
| ZW | Zimbabwe | Harare | -17.8158, 31.0428 | Africa/Harare (+120 min) | Covered |

The Natural Earth country layer omits several overseas dependencies. The bounds refresh supplements it with Natural Earth admin-0 map units and extends the generalized envelopes for northern Cyprus, Flying Fish Cove, Cape Horn, and remote territories attached to Australia, France, the UK, and the US. These wider envelopes keep retained overseas candidates inside their sovereign country's bounds. The source files are documented in `country-bounds.json` and `refresh-country-bounds.mjs`.
