"""
Automated Grid Context & Geography Detection Engine.
Dynamically detects the utility board (e.g. KSEB, TSSPDCL, BESCOM, TANGEDCO, MSEDCL, UPPCL, BRPL, etc.),
regulatory commission (e.g. KSERC, TGERC, KERC, TNERC, MERC, UPERC, DERC, etc.), state, climate archetype,
diurnal profile, and localized network metadata from geographic coordinates and ingested GDB metadata
across all 28 states and major Union Territories of India.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.src.models.network import (
    Feeder,
    Substation,
    Organisation,
    Bus,
    DistributionTransformer,
)


class DiurnalProfileContext(BaseModel):
    ambient_min_c: float
    ambient_max_c: float
    ambient_swing_c: float
    ambient_label: str
    peak_hours_desc: str
    is_ag_shift_dominant: bool
    default_consumer_mix: Dict[str, float]
    overload_driver_template: str


class GridContextResponse(BaseModel):
    utility_name: str
    utility_short: str
    regulatory_body: str
    regulatory_band: str
    supply_code_standard: str
    state: str
    district: str
    town: Optional[str] = None
    feeder_code: str
    feeder_name: str
    substation_code: str
    substation_name: str
    field_crew_default: str
    climate_archetype: str
    diurnal_profile: DiurnalProfileContext
    centroid_coordinates: Dict[str, float]


# Comprehensive regional database of Indian State Electricity Distribution Utilities (All Regions & States)
REGIONAL_UTILITY_PROFILES: Dict[str, Dict[str, Any]] = {
    # =========================================================================
    # 1. SOUTHERN REGION (SR)
    # =========================================================================
    "kerala": {
        "state": "Kerala",
        "utility_name": "Kerala State Electricity Board Limited (KSEB)",
        "utility_short": "KSEB",
        "regulatory_body": "KSERC",
        "regulatory_band": "KSERC ±6%",
        "supply_code_standard": "KSERC Distribution Code 2014",
        "climate_archetype": "coastal_maritime",
        "ambient_min_c": 24.5,
        "ambient_max_c": 33.5,
        "ambient_swing_c": 4.5,
        "ambient_label": "Kerala Coastal (25°C - 34°C)",
        "peak_hours_desc": "Domestic Evening Peak (18:00 - 22:00) & Harbour Commercial Shift",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 62.0, "commercial": 24.0, "industrial": 10.0, "agricultural": 4.0},
        "overload_driver_template": "KSEB Coastal Evening Lighting & Cooling Peak (18:00-22:00) + Harbour Demand",
        "crew_prefix": "Kozhikode Field Crew",
        "keywords": ["kseb", "kerala", "samagra", "kadavu", "kozhikode", "calicut", "cochin", "kochi", "thiruvananthapuram", "trivandrum", "ernakulam", "kannur", "malappuram", "thrissur", "palakkad", "kollam", "alappuzha", "kottayam", "wayanad", "idukki", "kasaragod", "pathanamthitta"],
    },
    "telangana": {
        "state": "Telangana",
        "utility_name": "Telangana State Southern Power Distribution Co. (TSSPDCL)",
        "utility_short": "TSSPDCL",
        "regulatory_body": "TGERC",
        "regulatory_band": "TGERC ±6%",
        "supply_code_standard": "TGERC Distribution Supply Code 2024",
        "climate_archetype": "inland_semi_arid",
        "ambient_min_c": 26.0,
        "ambient_max_c": 43.0,
        "ambient_swing_c": 8.5,
        "ambient_label": "Telangana Semi-Arid (26°C - 43°C)",
        "peak_hours_desc": "7-Hour Agricultural Pumping Shift (10:00 - 17:00) & Summer Peak",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 48.0, "commercial": 18.0, "agricultural": 24.0, "industrial": 10.0},
        "overload_driver_template": "Telangana 7h Agricultural Pumping Surge (10:00-17:00) + Afternoon Summer Thermal Peak",
        "crew_prefix": "Hyderabad Line Crew",
        "keywords": ["tsspdcl", "tsnpdcl", "telangana", "hyderabad", "rangareddy", "secunderabad", "warangal", "karimnagar", "khammam", "nizamabad", "nalgonda", "mahabubnagar", "medak", "cyberabad"],
    },
    "andhra_pradesh": {
        "state": "Andhra Pradesh",
        "utility_name": "Andhra Pradesh Eastern/Southern Power Distribution Co. (APEPDCL/APSPDCL)",
        "utility_short": "APEPDCL",
        "regulatory_body": "APERC",
        "regulatory_band": "APERC ±6%",
        "supply_code_standard": "APERC Electricity Supply Code 2014",
        "climate_archetype": "tropical_coastal_plains",
        "ambient_min_c": 25.0,
        "ambient_max_c": 41.5,
        "ambient_swing_c": 8.0,
        "ambient_label": "Andhra Coastal & Rayalaseema (25°C - 42°C)",
        "peak_hours_desc": "Daytime Agricultural Pumping & Coastal Cooling Peak",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 46.0, "commercial": 16.0, "agricultural": 26.0, "industrial": 12.0},
        "overload_driver_template": "Andhra Agro-Pumping Shift + Visakhapatnam Industrial Port Demand",
        "crew_prefix": "Visakhapatnam Line Crew",
        "keywords": ["apepdcl", "apspdcl", "apcpdcl", "andhra", "visakhapatnam", "vizag", "vijayawada", "guntur", "amaravati", "tirupati", "kurnool", "nellore", "kakinada", "rajahmundry", "anantapur", "kadapa"],
    },
    "karnataka": {
        "state": "Karnataka",
        "utility_name": "Bangalore Electricity Supply Company Limited (BESCOM)",
        "utility_short": "BESCOM",
        "regulatory_body": "KERC",
        "regulatory_band": "KERC ±6%",
        "supply_code_standard": "KERC Distribution Code 2020",
        "climate_archetype": "deccan_plateau",
        "ambient_min_c": 21.0,
        "ambient_max_c": 36.0,
        "ambient_swing_c": 7.0,
        "ambient_label": "Deccan Plateau (21°C - 36°C)",
        "peak_hours_desc": "Commercial Tech Park Peak (10:00 - 18:00) & Evening Domestic",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 52.0, "commercial": 30.0, "industrial": 12.0, "agricultural": 6.0},
        "overload_driver_template": "Commercial IT Tech Park Midday Peak + Domestic Evening Lighting",
        "crew_prefix": "Bengaluru Field Crew",
        "keywords": ["bescom", "mescom", "chescom", "hescom", "gescom", "karnataka", "bangalore", "bengaluru", "mysore", "mysuru", "hubli", "dharwad", "mangalore", "mangaluru", "belagavi", "gulbarga", "kalaburagi", "shimoga"],
    },
    "tamil_nadu": {
        "state": "Tamil Nadu",
        "utility_name": "Tamil Nadu Generation & Distribution Corporation (TANGEDCO)",
        "utility_short": "TANGEDCO",
        "regulatory_body": "TNERC",
        "regulatory_band": "TNERC ±6%",
        "supply_code_standard": "TNERC Distribution Code 2019",
        "climate_archetype": "tropical_coastal",
        "ambient_min_c": 25.0,
        "ambient_max_c": 39.5,
        "ambient_swing_c": 7.0,
        "ambient_label": "Tamil Nadu Tropical (25°C - 40°C)",
        "peak_hours_desc": "Industrial Double-Shift & Evening High Humidity AC Cooling Peak",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 50.0, "commercial": 22.0, "industrial": 20.0, "agricultural": 8.0},
        "overload_driver_template": "Industrial Motor Load + High Humidity Afternoon/Evening AC Peak",
        "crew_prefix": "Chennai Line Crew",
        "keywords": ["tangedco", "tamil nadu", "tamilnadu", "chennai", "coimbatore", "madurai", "tiruchirappalli", "trichy", "salem", "tirunelveli", "tiruppur", "erode", "vellore", "thoothukudi"],
    },
    "puducherry": {
        "state": "Puducherry",
        "utility_name": "Electricity Department Government of Puducherry (PED)",
        "utility_short": "PED",
        "regulatory_body": "JERC",
        "regulatory_band": "JERC ±6%",
        "supply_code_standard": "JERC Electricity Supply Code 2018",
        "climate_archetype": "tropical_maritime",
        "ambient_min_c": 25.0,
        "ambient_max_c": 38.0,
        "ambient_swing_c": 6.5,
        "ambient_label": "Puducherry Coastal (25°C - 38°C)",
        "peak_hours_desc": "Tourism Hospitality Peak & Evening Domestic Demand",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 55.0, "commercial": 28.0, "industrial": 14.0, "agricultural": 3.0},
        "overload_driver_template": "Coastal Tourism & Commercial Refrigeration Demand",
        "crew_prefix": "Puducherry Field Crew",
        "keywords": ["puducherry", "pondicherry", "ped", "karaikal", "mahe", "yanam"],
    },

    # =========================================================================
    # 2. WESTERN REGION (WR)
    # =========================================================================
    "maharashtra": {
        "state": "Maharashtra",
        "utility_name": "Maharashtra State Electricity Distribution Co. (MSEDCL)",
        "utility_short": "MSEDCL",
        "regulatory_body": "MERC",
        "regulatory_band": "MERC ±6%",
        "supply_code_standard": "MERC Electricity Supply Code 2021",
        "climate_archetype": "mixed_inland_deccan",
        "ambient_min_c": 22.0,
        "ambient_max_c": 41.0,
        "ambient_swing_c": 8.5,
        "ambient_label": "Maharashtra Mixed (22°C - 41°C)",
        "peak_hours_desc": "Industrial Shift Peak & High-Density Commercial Midday Demand",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 52.0, "commercial": 20.0, "industrial": 18.0, "agricultural": 10.0},
        "overload_driver_template": "MSEDCL High-Density Industrial Hub & Commercial Demand",
        "crew_prefix": "Pune Field Crew",
        "keywords": ["msedcl", "mahavitaran", "maharashtra", "mumbai", "pune", "nagpur", "nashik", "thane", "aurangabad", "chhatrapati sambhajinagar", "solapur", "kolhapur", "amravati", "navi mumbai", "tata power mumbai", "adani electricity"],
    },
    "gujarat": {
        "state": "Gujarat",
        "utility_name": "Gujarat Urja Vikas Nigam Ltd. (DGVCL/MGVCL/PGVCL/UGVCL)",
        "utility_short": "GUVNL",
        "regulatory_body": "GERC",
        "regulatory_band": "GERC ±6%",
        "supply_code_standard": "GERC Electricity Supply Code 2015",
        "climate_archetype": "semi_arid_coastal_industrial",
        "ambient_min_c": 22.5,
        "ambient_max_c": 43.5,
        "ambient_swing_c": 9.0,
        "ambient_label": "Gujarat Semi-Arid (23°C - 44°C)",
        "peak_hours_desc": "Continuous Industrial Process Load & Agricultural Jyotigram Feeders",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 42.0, "commercial": 18.0, "industrial": 28.0, "agricultural": 12.0},
        "overload_driver_template": "GUVNL Heavy Chemical/Textile Industrial Belt Demand + Agro Peak",
        "crew_prefix": "Ahmedabad Field Crew",
        "keywords": ["guvnl", "dgvcl", "mgvcl", "pgvcl", "ugvcl", "torrent power", "gujarat", "ahmedabad", "surat", "vadodara", "baroda", "rajkot", "bhavnagar", "jamnagar", "gandhinagar", "kutch", "bhuj", "morbi"],
    },
    "madhya_pradesh": {
        "state": "Madhya Pradesh",
        "utility_name": "MP Madhya/Poorv/Paschim Kshetra Vidyut Vitaran Co. (MPPKVVCL)",
        "utility_short": "MPPKVVCL",
        "regulatory_body": "MPERC",
        "regulatory_band": "MPERC ±6%",
        "supply_code_standard": "MPERC Supply Code 2021",
        "climate_archetype": "central_continental_plateau",
        "ambient_min_c": 21.0,
        "ambient_max_c": 44.0,
        "ambient_swing_c": 10.0,
        "ambient_label": "Madhya Pradesh Continental (21°C - 44°C)",
        "peak_hours_desc": "Rabi/Kharif Irrigation Pumping Peak & Extreme Summer Heat Wave",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 46.0, "commercial": 14.0, "agricultural": 28.0, "industrial": 12.0},
        "overload_driver_template": "Agricultural Deep Well Tube Pumping Peak + Heatwave Cooling",
        "crew_prefix": "Indore Field Crew",
        "keywords": ["mppkvvcl", "mpmkvvcl", "mppokvvcl", "madhya pradesh", "bhopal", "indore", "jabalpur", "gwalior", "ujjain", "sagar", "dewas", "satna", "ratlam", "rewa"],
    },
    "chhattisgarh": {
        "state": "Chhattisgarh",
        "utility_name": "Chhattisgarh State Power Distribution Co. Ltd. (CSPDCL)",
        "utility_short": "CSPDCL",
        "regulatory_body": "CSERC",
        "regulatory_band": "CSERC ±6%",
        "supply_code_standard": "CSERC Electricity Supply Code 2011",
        "climate_archetype": "tropical_inland_mineral_belt",
        "ambient_min_c": 22.0,
        "ambient_max_c": 43.0,
        "ambient_swing_c": 9.0,
        "ambient_label": "Chhattisgarh Mineral Basin (22°C - 43°C)",
        "peak_hours_desc": "Heavy Steel Rolling Mills & Sponge Iron Industrial Arc Peak",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 44.0, "commercial": 14.0, "industrial": 32.0, "agricultural": 10.0},
        "overload_driver_template": "Steel Ingot & Smelting Arc Furnace Heavy Industrial Load",
        "crew_prefix": "Raipur Line Crew",
        "keywords": ["cspdcl", "cserc", "chhattisgarh", "raipur", "bhilai", "bilaspur", "korba", "durg", "rajnandgaon", "raigarh", "jagdalpur", "ambikapur"],
    },
    "goa": {
        "state": "Goa",
        "utility_name": "Electricity Department Government of Goa (GED)",
        "utility_short": "GED",
        "regulatory_body": "JERC",
        "regulatory_band": "JERC ±6%",
        "supply_code_standard": "JERC Electricity Supply Code 2018",
        "climate_archetype": "konkan_coastal_maritime",
        "ambient_min_c": 24.0,
        "ambient_max_c": 35.0,
        "ambient_swing_c": 5.0,
        "ambient_label": "Goa Konkan Coastal (24°C - 35°C)",
        "peak_hours_desc": "Hospitality Tourism Cluster Peak & Port Infrastructure Demand",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 56.0, "commercial": 30.0, "industrial": 12.0, "agricultural": 2.0},
        "overload_driver_template": "Konkan Resort Tourism Cooling Peak + Mining Port Operations",
        "crew_prefix": "Panaji Field Crew",
        "keywords": ["ged", "goa", "panaji", "panjim", "margao", "vasco", "mapusa", "ponda", "mormugao"],
    },
    "dadra_nagar_haveli_daman_diu": {
        "state": "Dadra and Nagar Haveli and Daman and Diu",
        "utility_name": "DNH Power Distribution Corporation Limited (DNHPDCL)",
        "utility_short": "DNHPDCL",
        "regulatory_body": "JERC",
        "regulatory_band": "JERC ±6%",
        "supply_code_standard": "JERC Electricity Supply Code 2018",
        "climate_archetype": "coastal_industrial_enclave",
        "ambient_min_c": 23.0,
        "ambient_max_c": 38.0,
        "ambient_swing_c": 7.0,
        "ambient_label": "DNH Coastal Industrial (23°C - 38°C)",
        "peak_hours_desc": "Manufacturing Continuous Triple-Shift Industrial Load",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 22.0, "commercial": 10.0, "industrial": 66.0, "agricultural": 2.0},
        "overload_driver_template": "Continuous Heavy Plastics & Textile Industrial Feeder Demand",
        "crew_prefix": "Silvassa Field Crew",
        "keywords": ["dnhpdcl", "silvassa", "daman", "diu", "dadra", "nagar haveli"],
    },

    # =========================================================================
    # 3. NORTHERN REGION (NR)
    # =========================================================================
    "delhi": {
        "state": "NCT of Delhi",
        "utility_name": "BSES Rajdhani / Yamuna Power / Tata Power DDL (BRPL/BYPL/TPDDL)",
        "utility_short": "BRPL",
        "regulatory_body": "DERC",
        "regulatory_band": "DERC ±6%",
        "supply_code_standard": "DERC Supply Code and Performance Standards 2017",
        "climate_archetype": "subtropical_extreme_urban",
        "ambient_min_c": 12.0,
        "ambient_max_c": 46.5,
        "ambient_swing_c": 14.0,
        "ambient_label": "Delhi Metro Subtropical (12°C - 47°C)",
        "peak_hours_desc": "Extreme Summer Afternoon & Night AC Cooling Surge (Peak > 8000 MW)",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 64.0, "commercial": 26.0, "industrial": 10.0, "agricultural": 0.0},
        "overload_driver_template": "Massive Urban Domestic/Commercial AC Load (θ_a > 42°C)",
        "crew_prefix": "New Delhi Line Crew",
        "keywords": ["brpl", "bypl", "tpddl", "delhi", "bses", "tata power ddl", "new delhi", "dwarka", "rohini", "saket", "lajpat nagar", "connaught place", "karol bagh"],
    },
    "uttar_pradesh": {
        "state": "Uttar Pradesh",
        "utility_name": "Uttar Pradesh Power Corporation Limited (UPPCL / PVVNL / MVVNL / DVVNL / PuVVNL)",
        "utility_short": "UPPCL",
        "regulatory_body": "UPERC",
        "regulatory_band": "UPERC ±6%",
        "supply_code_standard": "UP Electricity Supply Code 2005 (Amended 2022)",
        "climate_archetype": "indo_gangetic_plains",
        "ambient_min_c": 14.0,
        "ambient_max_c": 45.0,
        "ambient_swing_c": 12.0,
        "ambient_label": "Gangetic Plains (14°C - 45°C)",
        "peak_hours_desc": "Submersible Rural Tube Wells & High-Density Urban Domestic Peak",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 54.0, "commercial": 16.0, "agricultural": 20.0, "industrial": 10.0},
        "overload_driver_template": "UP Rural Agro-Tubewell Rostering + Evening Lighting Peak",
        "crew_prefix": "Lucknow Line Crew",
        "keywords": ["uppcl", "pvvnl", "mvvnl", "dvvnl", "puvvnl", "kesco", "uttar pradesh", "lucknow", "noida", "greater noida", "ghaziabad", "kanpur", "varanasi", "banaras", "agra", "prayagraj", "allahabad", "meerut", "bareilly", "aligarh", "moradabad", "gorakhpur", "saharanpur", "ayodhya"],
    },
    "punjab": {
        "state": "Punjab",
        "utility_name": "Punjab State Power Corporation Limited (PSPCL)",
        "utility_short": "PSPCL",
        "regulatory_body": "PSERC",
        "regulatory_band": "PSERC ±6%",
        "supply_code_standard": "PSERC Electricity Supply Code 2014",
        "climate_archetype": "agro_intensive_plains",
        "ambient_min_c": 10.0,
        "ambient_max_c": 44.5,
        "ambient_swing_c": 13.0,
        "ambient_label": "Punjab Agro Plains (10°C - 45°C)",
        "peak_hours_desc": "8-Hour Paddy Sowing Tubewell Pumping Surge (June - September)",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 44.0, "commercial": 12.0, "agricultural": 32.0, "industrial": 12.0},
        "overload_driver_template": "PSPCL Intensive Paddy Cultivation Submersible Tube Well Shift",
        "crew_prefix": "Ludhiana Field Crew",
        "keywords": ["pspcl", "pstcl", "punjab", "ludhiana", "amritsar", "jalandhar", "patiala", "bathinda", "mohali", "sas nagar", "pathankot", "hoshiarpur"],
    },
    "haryana": {
        "state": "Haryana",
        "utility_name": "Uttar / Dakshin Haryana Bijli Vitran Nigam (UHBVN / DHBVN)",
        "utility_short": "DHBVN",
        "regulatory_body": "HERC",
        "regulatory_band": "HERC ±6%",
        "supply_code_standard": "HERC Electricity Supply Code 2014",
        "climate_archetype": "semi_arid_agro_industrial",
        "ambient_min_c": 12.0,
        "ambient_max_c": 45.0,
        "ambient_swing_c": 12.5,
        "ambient_label": "Haryana Agro-NCR (12°C - 45°C)",
        "peak_hours_desc": "Gurugram Cyber Hub Commercial Cooling & Rural Tube Wells",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 45.0, "commercial": 22.0, "industrial": 18.0, "agricultural": 15.0},
        "overload_driver_template": "Gurugram Corporate IT Peak + Western Yamuna Agro Tubewells",
        "crew_prefix": "Gurugram Line Crew",
        "keywords": ["dhbvn", "uhbvn", "haryana", "gurugram", "gurgaon", "faridabad", "panipat", "ambala", "karnal", "rohtak", "hisar", "sonipat", "panchkula"],
    },
    "rajasthan": {
        "state": "Rajasthan",
        "utility_name": "Jaipur / Ajmer / Jodhpur Vidyut Vitran Nigam Ltd. (JVVNL / AVVNL / JdVVNL)",
        "utility_short": "JVVNL",
        "regulatory_body": "RERC",
        "regulatory_band": "RERC ±6%",
        "supply_code_standard": "RERC Electricity Supply Code 2021",
        "climate_archetype": "arid_desert",
        "ambient_min_c": 15.0,
        "ambient_max_c": 48.0,
        "ambient_swing_c": 15.0,
        "ambient_label": "Thar Desert Arid (15°C - 48°C)",
        "peak_hours_desc": "Desert Daytime Agricultural Pumping & Extreme Summer Thermal Swells",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 42.0, "commercial": 15.0, "agricultural": 30.0, "industrial": 13.0},
        "overload_driver_template": "Extreme Thar Ambient Heatwave (>46°C) + Solar Infeed Reverse Flow",
        "crew_prefix": "Jaipur Line Crew",
        "keywords": ["jvvnl", "avvnl", "jdvvnl", "rajasthan", "jaipur", "jodhpur", "kota", "bikaner", "ajmer", "udaipur", "bhilwara", "alwar", "sikar", "bharatpur", "pali", "jaisalmer", "barmer"],
    },
    "himachal_pradesh": {
        "state": "Himachal Pradesh",
        "utility_name": "Himachal Pradesh State Electricity Board Ltd. (HPSEBL)",
        "utility_short": "HPSEBL",
        "regulatory_body": "HPERC",
        "regulatory_band": "HPERC ±6%",
        "supply_code_standard": "HPERC Electricity Supply Code 2009",
        "climate_archetype": "himalayan_montane",
        "ambient_min_c": -2.0,
        "ambient_max_c": 31.0,
        "ambient_swing_c": 11.0,
        "ambient_label": "Himalayan Alpine (-2°C - 31°C)",
        "peak_hours_desc": "Sub-Zero Winter Heating Peak (Space Heaters & Geysers)",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 52.0, "commercial": 24.0, "industrial": 20.0, "agricultural": 4.0},
        "overload_driver_template": "HP Winter Freeze Electric Space Heating & Hospitality Demand",
        "crew_prefix": "Shimla Alpine Crew",
        "keywords": ["hpsebl", "himachal", "himachal pradesh", "shimla", "dharamshala", "solan", "mandi", "kullu", "manali", "bilaspur", "chamba", "baddi"],
    },
    "uttarakhand": {
        "state": "Uttarakhand",
        "utility_name": "Uttarakhand Power Corporation Limited (UPCL)",
        "utility_short": "UPCL",
        "regulatory_body": "UERC",
        "regulatory_band": "UERC ±6%",
        "supply_code_standard": "UERC Electricity Supply Code 2020",
        "climate_archetype": "sub_himalayan_valleys",
        "ambient_min_c": 4.0,
        "ambient_max_c": 37.0,
        "ambient_swing_c": 12.0,
        "ambient_label": "Sub-Himalayan Valley (4°C - 37°C)",
        "peak_hours_desc": "Winter Heating Demand & SIDCUL Industrial Corridor Continuous Load",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 48.0, "commercial": 20.0, "industrial": 26.0, "agricultural": 6.0},
        "overload_driver_template": "SIDCUL Haridwar/Pantnagar Heavy Industrial Manufacturing Demand",
        "crew_prefix": "Dehradun Field Crew",
        "keywords": ["upcl", "uttarakhand", "dehradun", "haridwar", "roorkee", "haldwani", "rudrapur", "kashipur", "rishikesh", "nainital", "pantnagar"],
    },
    "jammu_and_kashmir": {
        "state": "Jammu and Kashmir",
        "utility_name": "Jammu/Kashmir Power Distribution Corporation (JPDCL / KPDCL)",
        "utility_short": "KPDCL",
        "regulatory_body": "JERC-JK",
        "regulatory_band": "JERC-JK ±6%",
        "supply_code_standard": "JERC-JK Supply Code 2022",
        "climate_archetype": "himalayan_temperate_snow",
        "ambient_min_c": -6.0,
        "ambient_max_c": 34.0,
        "ambient_swing_c": 14.0,
        "ambient_label": "Kashmir Montane (-6°C - 34°C)",
        "peak_hours_desc": "Severe Winter 'Chillai Kalan' Heavy Resistive Heating Peak",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 68.0, "commercial": 22.0, "industrial": 8.0, "agricultural": 2.0},
        "overload_driver_template": "Sub-Zero Winter Domestic Crude Coil & Resistive Heating Surge",
        "crew_prefix": "Srinagar Central Crew",
        "keywords": ["kpdcl", "jpdcl", "jammu", "kashmir", "srinagar", "anantnag", "baramulla", "udhampur", "katra", "sopore"],
    },
    "ladakh": {
        "state": "Ladakh",
        "utility_name": "Power Development Department UT of Ladakh (PDD Ladakh)",
        "utility_short": "PDD_LADAKH",
        "regulatory_body": "JERC-JK",
        "regulatory_band": "JERC-JK ±6%",
        "supply_code_standard": "JERC-JK Supply Code 2022",
        "climate_archetype": "high_altitude_cold_desert",
        "ambient_min_c": -20.0,
        "ambient_max_c": 28.0,
        "ambient_swing_c": 16.0,
        "ambient_label": "High Altitude Cold Desert (-20°C - 28°C)",
        "peak_hours_desc": "Sub-Zero Winter Extreme Heating & Solar Microgrid Battery Peak",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 65.0, "commercial": 25.0, "industrial": 8.0, "agricultural": 2.0},
        "overload_driver_template": "Extreme High-Altitude Cold Resistance Heating Surge",
        "crew_prefix": "Leh Alpine Crew",
        "keywords": ["ladakh", "leh", "kargil", "nubra", "drass", "zanskar"],
    },
    "chandigarh": {
        "state": "Chandigarh",
        "utility_name": "Electricity Department UT of Chandigarh (CED)",
        "utility_short": "CED",
        "regulatory_body": "JERC",
        "regulatory_band": "JERC ±6%",
        "supply_code_standard": "JERC Electricity Supply Code 2018",
        "climate_archetype": "urban_planned_subtropical",
        "ambient_min_c": 11.0,
        "ambient_max_c": 44.0,
        "ambient_swing_c": 12.0,
        "ambient_label": "Chandigarh Planned Urban (11°C - 44°C)",
        "peak_hours_desc": "High-Density Residential & Commercial Institutional Air Conditioning",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 60.0, "commercial": 28.0, "industrial": 11.0, "agricultural": 1.0},
        "overload_driver_template": "Planned Urban Sector High Air-Conditioning Penetration Peak",
        "crew_prefix": "Chandigarh Sector Crew",
        "keywords": ["chandigarh", "ced"],
    },

    # =========================================================================
    # 4. EASTERN REGION (ER)
    # =========================================================================
    "west_bengal": {
        "state": "West Bengal",
        "utility_name": "West Bengal State Electricity Distribution Co. Ltd. (WBSEDCL / CESC)",
        "utility_short": "WBSEDCL",
        "regulatory_body": "WBERC",
        "regulatory_band": "WBERC ±6%",
        "supply_code_standard": "WBERC Electricity Supply Code 2013",
        "climate_archetype": "tropical_humid_delta",
        "ambient_min_c": 18.0,
        "ambient_max_c": 39.0,
        "ambient_swing_c": 7.5,
        "ambient_label": "Bengal Humid Delta (18°C - 39°C)",
        "peak_hours_desc": "Extreme Humidity Evening Cooling Peak & Jute/Engineering Mills",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 55.0, "commercial": 20.0, "industrial": 18.0, "agricultural": 7.0},
        "overload_driver_template": "High Wet-Bulb Humidity Evening Domestic Fan/Cooling Surge",
        "crew_prefix": "Kolkata North Crew",
        "keywords": ["wbsedcl", "cesc", "west bengal", "bengal", "kolkata", "calcutta", "howrah", "asansol", "siliguri", "durgapur", "bardhaman", "malda", "kharagpur", "haldia"],
    },
    "bihar": {
        "state": "Bihar",
        "utility_name": "North / South Bihar Power Distribution Company Limited (NBPDCL / SBPDCL)",
        "utility_short": "SBPDCL",
        "regulatory_body": "BERC",
        "regulatory_band": "BERC ±6%",
        "supply_code_standard": "BERC Electricity Supply Code 2017",
        "climate_archetype": "gangetic_floodplain",
        "ambient_min_c": 14.0,
        "ambient_max_c": 44.0,
        "ambient_swing_c": 11.5,
        "ambient_label": "Bihar Gangetic Basin (14°C - 44°C)",
        "peak_hours_desc": "Rural Electrification Domestic Night Surge & Agro Tubewells",
        "is_ag_shift_dominant": True,
        "default_consumer_mix": {"domestic": 62.0, "commercial": 15.0, "agricultural": 15.0, "industrial": 8.0},
        "overload_driver_template": "Rural Feeder Late Evening Lighting & Agro Pumping Shift",
        "crew_prefix": "Patna Line Crew",
        "keywords": ["nbpdcl", "sbpdcl", "bihar", "patna", "gaya", "bhagalpur", "muzaffarpur", "purnia", "darbhanga", "bihar sharif", "arrah", "begusarai", "katihar"],
    },
    "odisha": {
        "state": "Odisha",
        "utility_name": "TP Central/Western/Southern/Northern Odisha Distribution Ltd. (TPCODL / TPWODL)",
        "utility_short": "TPCODL",
        "regulatory_body": "OERC",
        "regulatory_band": "OERC ±6%",
        "supply_code_standard": "OERC Distribution Code 2019",
        "climate_archetype": "tropical_cyclonic_coastal",
        "ambient_min_c": 21.0,
        "ambient_max_c": 43.0,
        "ambient_swing_c": 8.5,
        "ambient_label": "Odisha Coastal & Mineral (21°C - 43°C)",
        "peak_hours_desc": "Aluminium/Steel Heavy Metallurgical Smelters & Coastal Cyclonic Shift",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 48.0, "commercial": 16.0, "industrial": 26.0, "agricultural": 10.0},
        "overload_driver_template": "Heavy Metallurgical Smelter Load + High Humidity Coastal Surge",
        "crew_prefix": "Bhubaneswar Line Crew",
        "keywords": ["tpcodl", "tpwodl", "tpsodl", "tpnodl", "gridco", "odisha", "orissa", "bhubaneswar", "cuttack", "rourkela", "berhampur", "sambalpur", "puri", "balasore", "bhadrak", "angul", "jharsuguda"],
    },
    "jharkhand": {
        "state": "Jharkhand",
        "utility_name": "Jharkhand Bijli Vitran Nigam Limited (JBVNL / JUSCO)",
        "utility_short": "JBVNL",
        "regulatory_body": "JSERC",
        "regulatory_band": "JSERC ±6%",
        "supply_code_standard": "JSERC Electricity Supply Code 2015",
        "climate_archetype": "chota_nagpur_mineral_plateau",
        "ambient_min_c": 16.0,
        "ambient_max_c": 43.5,
        "ambient_swing_c": 11.0,
        "ambient_label": "Chota Nagpur Plateau (16°C - 44°C)",
        "peak_hours_desc": "Heavy Coal Mining Draglines, Heavy Engineering & Steel Foundries",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 45.0, "commercial": 14.0, "industrial": 35.0, "agricultural": 6.0},
        "overload_driver_template": "Heavy Coal Mining Excavators & Jamshedpur Automotive Cluster Demand",
        "crew_prefix": "Ranchi Field Crew",
        "keywords": ["jbvnl", "jusco", "jharkhand", "ranchi", "jamshedpur", "tatanagar", "dhanbad", "bokaro", "deoghar", "hazaribagh", "giridih", "ramgarh"],
    },
    "sikkim": {
        "state": "Sikkim",
        "utility_name": "Power & Energy Department Government of Sikkim (PED Sikkim)",
        "utility_short": "PED_SIKKIM",
        "regulatory_body": "SSERC",
        "regulatory_band": "SSERC ±6%",
        "supply_code_standard": "SSERC Supply Code 2012",
        "climate_archetype": "eastern_himalayan_montane",
        "ambient_min_c": 2.0,
        "ambient_max_c": 26.0,
        "ambient_swing_c": 8.0,
        "ambient_label": "Eastern Himalayan (2°C - 26°C)",
        "peak_hours_desc": "Pharmaceutical Manufacturing Hub Load & Winter Heating",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 50.0, "commercial": 22.0, "industrial": 25.0, "agricultural": 3.0},
        "overload_driver_template": "Pharma Cleanroom Climate Control + Alpine Heating Surge",
        "crew_prefix": "Gangtok Alpine Crew",
        "keywords": ["sikkim", "gangtok", "namchi", "gyalshing", "mangan", "singtam", "rangpo"],
    },

    # =========================================================================
    # 5. NORTH-EASTERN REGION (NER)
    # =========================================================================
    "assam": {
        "state": "Assam",
        "utility_name": "Assam Power Distribution Company Limited (APDCL)",
        "utility_short": "APDCL",
        "regulatory_body": "AERC",
        "regulatory_band": "AERC ±6%",
        "supply_code_standard": "AERC Electricity Supply Code 2019",
        "climate_archetype": "brahmaputra_subtropical_monsoon",
        "ambient_min_c": 16.0,
        "ambient_max_c": 36.5,
        "ambient_swing_c": 7.5,
        "ambient_label": "Brahmaputra Valley (16°C - 37°C)",
        "peak_hours_desc": "Tea Estate Processing Season (April - November) & Evening Domestic",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 58.0, "commercial": 20.0, "industrial": 18.0, "agricultural": 4.0},
        "overload_driver_template": "Tea Factory CTC Machinery Processing + Humid Evening Peak",
        "crew_prefix": "Guwahati Field Crew",
        "keywords": ["apdcl", "aerc", "assam", "guwahati", "silchar", "dibrugarh", "jorhat", "nagaon", "tinsukia", "tezpur", "bongaigaon"],
    },
    "meghalaya": {
        "state": "Meghalaya",
        "utility_name": "Meghalaya Power Distribution Corporation Limited (MePDCL)",
        "utility_short": "MePDCL",
        "regulatory_body": "MSERC",
        "regulatory_band": "MSERC ±6%",
        "supply_code_standard": "MSERC Electricity Supply Code 2018",
        "climate_archetype": "highland_high_rainfall",
        "ambient_min_c": 8.0,
        "ambient_max_c": 28.0,
        "ambient_swing_c": 8.0,
        "ambient_label": "Meghalaya Highland (8°C - 28°C)",
        "peak_hours_desc": "Cement Clinker Kiln Industrial Feeders & Monsoonal Domestic Peaks",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 54.0, "commercial": 18.0, "industrial": 25.0, "agricultural": 3.0},
        "overload_driver_template": "Heavy Cement Manufacturing & Highland Winter Heating",
        "crew_prefix": "Shillong Line Crew",
        "keywords": ["mepdcl", "meghalaya", "shillong", "tura", "jowai", "nongpoh", "byrnihat"],
    },
    "tripura": {
        "state": "Tripura",
        "utility_name": "Tripura State Electricity Corporation Limited (TSECL)",
        "utility_short": "TSECL",
        "regulatory_body": "TERC",
        "regulatory_band": "TERC ±6%",
        "supply_code_standard": "TERC Electricity Supply Code 2011",
        "climate_archetype": "tropical_humid_sub_himalayan",
        "ambient_min_c": 17.0,
        "ambient_max_c": 36.0,
        "ambient_swing_c": 7.0,
        "ambient_label": "Tripura Humid (17°C - 36°C)",
        "peak_hours_desc": "Domestic Evening Lighting & Gas-Based Micro-Industrial Units",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 66.0, "commercial": 20.0, "industrial": 10.0, "agricultural": 4.0},
        "overload_driver_template": "High Monsoonal Humidity Domestic Fan and Lighting Load",
        "crew_prefix": "Agartala Field Crew",
        "keywords": ["tsecl", "terc", "tripura", "agartala", "dharmanagar", "udaipur_tripura", "kailashahar", "belonia"],
    },
    "manipur": {
        "state": "Manipur",
        "utility_name": "Manipur State Power Distribution Company Limited (MSPDCL)",
        "utility_short": "MSPDCL",
        "regulatory_body": "JERC-MN-MZ",
        "regulatory_band": "JERC-MN-MZ ±6%",
        "supply_code_standard": "JERC-MN-MZ Electricity Supply Code 2013",
        "climate_archetype": "subtropical_hill_valley",
        "ambient_min_c": 9.0,
        "ambient_max_c": 31.0,
        "ambient_swing_c": 8.0,
        "ambient_label": "Manipur Valley (9°C - 31°C)",
        "peak_hours_desc": "Valley Domestic Evening Lighting & Handloom Cluster Demand",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 70.0, "commercial": 20.0, "industrial": 7.0, "agricultural": 3.0},
        "overload_driver_template": "Imphal Valley Domestic Evening Demand & Handloom Clusters",
        "crew_prefix": "Imphal Line Crew",
        "keywords": ["mspdcl", "manipur", "imphal", "churachandpur", "thoubal", "bishnupur"],
    },
    "mizoram": {
        "state": "Mizoram",
        "utility_name": "Power & Electricity Department Government of Mizoram (PED Mizoram)",
        "utility_short": "PED_MIZORAM",
        "regulatory_body": "JERC-MN-MZ",
        "regulatory_band": "JERC-MN-MZ ±6%",
        "supply_code_standard": "JERC-MN-MZ Electricity Supply Code 2013",
        "climate_archetype": "montane_subtropical_ridge",
        "ambient_min_c": 11.0,
        "ambient_max_c": 30.0,
        "ambient_swing_c": 7.5,
        "ambient_label": "Mizoram Ridge (11°C - 30°C)",
        "peak_hours_desc": "Hilly Residential Evening Lighting & Food Processing Micro-Units",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 72.0, "commercial": 20.0, "industrial": 6.0, "agricultural": 2.0},
        "overload_driver_template": "Ridge Top Domestic Lighting & Cold Winter Warming Demand",
        "crew_prefix": "Aizawl Field Crew",
        "keywords": ["mizoram", "aizawl", "lunglei", "champhai", "serchhip", "kolasib"],
    },
    "nagaland": {
        "state": "Nagaland",
        "utility_name": "Department of Power Nagaland (DPN)",
        "utility_short": "DPN",
        "regulatory_body": "NERC",
        "regulatory_band": "NERC ±6%",
        "supply_code_standard": "NERC Electricity Supply Code 2012",
        "climate_archetype": "himalayan_montane_jungle",
        "ambient_min_c": 10.0,
        "ambient_max_c": 31.0,
        "ambient_swing_c": 8.0,
        "ambient_label": "Nagaland Montane (10°C - 31°C)",
        "peak_hours_desc": "Commercial Dimapur Railhead Hub & Hilltop Domestic Evening Load",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 68.0, "commercial": 22.0, "industrial": 8.0, "agricultural": 2.0},
        "overload_driver_template": "Dimapur Commercial Trading Hub + Hill Domestic Lighting Peak",
        "crew_prefix": "Kohima Field Crew",
        "keywords": ["nagaland", "kohima", "dimapur", "mokokchung", "tuensang", "wohka"],
    },
    "arunachal_pradesh": {
        "state": "Arunachal Pradesh",
        "utility_name": "Department of Power Arunachal Pradesh (DoPAP)",
        "utility_short": "DoPAP",
        "regulatory_body": "APERC",
        "regulatory_band": "APERC ±6%",
        "supply_code_standard": "APERC Electricity Supply Code 2013",
        "climate_archetype": "eastern_himalayan_alpine",
        "ambient_min_c": 0.0,
        "ambient_max_c": 29.0,
        "ambient_swing_c": 10.0,
        "ambient_label": "Arunachal Alpine (0°C - 29°C)",
        "peak_hours_desc": "Severe Winter Cold Heating & Strategic Border Infrastructure Load",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 66.0, "commercial": 22.0, "industrial": 10.0, "agricultural": 2.0},
        "overload_driver_template": "Himalayan Severe Cold Resistance Heating & Hydro Dispatch",
        "crew_prefix": "Itanagar Alpine Crew",
        "keywords": ["dopap", "arunachal", "arunachal pradesh", "itanagar", "naharlagun", "pasighat", "tawang", "ziro", "bomdila"],
    },

    # =========================================================================
    # GENERIC FALLBACK
    # =========================================================================
    "generic": {
        "state": "National Grid",
        "utility_name": "State Electricity Distribution Company (DISCOM)",
        "utility_short": "DISCOM",
        "regulatory_body": "SERC",
        "regulatory_band": "SERC ±6%",
        "supply_code_standard": "State Electricity Regulatory Supply Code / CEA Standards",
        "climate_archetype": "composite",
        "ambient_min_c": 22.0,
        "ambient_max_c": 38.0,
        "ambient_swing_c": 7.0,
        "ambient_label": "Regional Composite (22°C - 38°C)",
        "peak_hours_desc": "Morning Peak (08:00 - 10:00) & Evening Peak (18:00 - 22:00)",
        "is_ag_shift_dominant": False,
        "default_consumer_mix": {"domestic": 55.0, "commercial": 22.0, "industrial": 13.0, "agricultural": 10.0},
        "overload_driver_template": "Distribution Feeder Peak Demand + Diurnal Temperature Surge",
        "crew_prefix": "Distribution Line Crew",
        "keywords": [],
    },
}


# Geographic Bounding Boxes for Indian States/UTs (WGS84 Lat/Lon ranges)
# Ordered from specific small-envelope/enclave states to broader regional polygons
STATE_BOUNDING_BOXES: List[Dict[str, Any]] = [
    # Enclaves and Compact Territories first
    {"key": "delhi", "lat_min": 28.40, "lat_max": 28.90, "lon_min": 76.80, "lon_max": 77.45},
    {"key": "chandigarh", "lat_min": 30.65, "lat_max": 30.82, "lon_min": 76.68, "lon_max": 76.85},
    {"key": "goa", "lat_min": 14.85, "lat_max": 15.80, "lon_min": 73.65, "lon_max": 74.40},
    {"key": "puducherry", "lat_min": 11.80, "lat_max": 12.05, "lon_min": 79.70, "lon_max": 79.90},
    {"key": "dadra_nagar_haveli_daman_diu", "lat_min": 20.00, "lat_max": 20.85, "lon_min": 72.75, "lon_max": 73.25},
    {"key": "sikkim", "lat_min": 27.05, "lat_max": 28.15, "lon_min": 88.00, "lon_max": 88.95},
    {"key": "tripura", "lat_min": 22.90, "lat_max": 24.60, "lon_min": 91.10, "lon_max": 92.40},
    {"key": "meghalaya", "lat_min": 25.00, "lat_max": 26.15, "lon_min": 89.80, "lon_max": 92.85},
    {"key": "mizoram", "lat_min": 21.90, "lat_max": 24.55, "lon_min": 92.20, "lon_max": 93.50},
    {"key": "manipur", "lat_min": 23.80, "lat_max": 25.75, "lon_min": 93.00, "lon_max": 94.85},
    {"key": "nagaland", "lat_min": 25.10, "lat_max": 27.05, "lon_min": 93.30, "lon_max": 95.30},

    # Coastal & Southern States
    {"key": "kerala", "lat_min": 8.10, "lat_max": 12.90, "lon_min": 74.80, "lon_max": 77.55},
    {"key": "tamil_nadu", "lat_min": 8.00, "lat_max": 13.60, "lon_min": 76.20, "lon_max": 80.40},
    {"key": "karnataka", "lat_min": 11.50, "lat_max": 18.55, "lon_min": 74.00, "lon_max": 78.60},
    {"key": "telangana", "lat_min": 15.80, "lat_max": 19.95, "lon_min": 77.20, "lon_max": 81.85},
    {"key": "andhra_pradesh", "lat_min": 12.60, "lat_max": 19.20, "lon_min": 76.70, "lon_max": 84.80},

    # Western & Central States
    {"key": "maharashtra", "lat_min": 15.60, "lat_max": 22.10, "lon_min": 72.60, "lon_max": 80.95},
    {"key": "gujarat", "lat_min": 20.10, "lat_max": 24.75, "lon_min": 68.10, "lon_max": 74.50},
    {"key": "chhattisgarh", "lat_min": 17.75, "lat_max": 24.15, "lon_min": 80.20, "lon_max": 84.45},
    {"key": "madhya_pradesh", "lat_min": 21.10, "lat_max": 26.90, "lon_min": 74.00, "lon_max": 82.85},

    # Eastern States
    {"key": "odisha", "lat_min": 17.80, "lat_max": 22.60, "lon_min": 81.40, "lon_max": 87.55},
    {"key": "jharkhand", "lat_min": 21.95, "lat_max": 25.35, "lon_min": 83.30, "lon_max": 87.95},
    {"key": "west_bengal", "lat_min": 21.50, "lat_max": 27.30, "lon_min": 85.80, "lon_max": 89.90},
    {"key": "bihar", "lat_min": 24.30, "lat_max": 27.55, "lon_min": 83.30, "lon_max": 88.35},

    # Northern States
    {"key": "rajasthan", "lat_min": 23.00, "lat_max": 30.25, "lon_min": 69.50, "lon_max": 78.30},
    {"key": "haryana", "lat_min": 27.65, "lat_max": 30.95, "lon_min": 74.45, "lon_max": 77.65},
    {"key": "punjab", "lat_min": 29.50, "lat_max": 32.55, "lon_min": 73.85, "lon_max": 76.95},
    {"key": "uttar_pradesh", "lat_min": 23.85, "lat_max": 30.45, "lon_min": 77.10, "lon_max": 84.65},
    {"key": "uttarakhand", "lat_min": 28.70, "lat_max": 31.45, "lon_min": 77.55, "lon_max": 81.10},
    {"key": "himachal_pradesh", "lat_min": 30.35, "lat_max": 33.30, "lon_min": 75.60, "lon_max": 79.10},
    {"key": "jammu_and_kashmir", "lat_min": 32.25, "lat_max": 37.10, "lon_min": 73.40, "lon_max": 77.50},
    {"key": "ladakh", "lat_min": 32.25, "lat_max": 36.00, "lon_min": 75.50, "lon_max": 80.50},

    # North-Eastern States
    {"key": "assam", "lat_min": 24.10, "lat_max": 28.00, "lon_min": 89.70, "lon_max": 96.00},
    {"key": "arunachal_pradesh", "lat_min": 26.50, "lat_max": 29.50, "lon_min": 91.50, "lon_max": 97.50},
]


def detect_grid_region(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    hint_text: str = "",
) -> Dict[str, Any]:
    """
    Detects regional utility archetype using explicit text hints, GDB names,
    and geographic coordinate bounding box classification across all states of India.
    """
    text_lower = (hint_text or "").lower()

    # 1. Direct text hints in file name, layer names, or organisation code (matches keywords across all profiles)
    for profile_key, profile_data in REGIONAL_UTILITY_PROFILES.items():
        if profile_key == "generic":
            continue
        # Check utility short code
        if profile_data["utility_short"].lower() in text_lower:
            return profile_data
        # Check regulatory body acronym
        if profile_data["regulatory_body"].lower() in text_lower:
            return profile_data
        # Check profile key itself (e.g. 'kerala', 'punjab')
        if profile_key.replace("_", " ") in text_lower or profile_key in text_lower:
            return profile_data
        # Check keyword matches
        for kw in profile_data.get("keywords", []):
            if kw and kw in text_lower:
                return profile_data

    # 2. Geographic Coordinate Bounding Box Classification (WGS84 lat/lon)
    if latitude is not None and longitude is not None:
        try:
            lat = float(latitude)
            lon = float(longitude)

            # Match against ordered bounding box envelopes
            for bbox in STATE_BOUNDING_BOXES:
                if (bbox["lat_min"] <= lat <= bbox["lat_max"]) and (bbox["lon_min"] <= lon <= bbox["lon_max"]):
                    matched_key = bbox["key"]
                    if matched_key in REGIONAL_UTILITY_PROFILES:
                        return REGIONAL_UTILITY_PROFILES[matched_key]
        except (ValueError, TypeError):
            pass

    # 3. Fallback generic archetype
    return REGIONAL_UTILITY_PROFILES["generic"]


def get_feeder_grid_context(
    db_session: Session,
    feeder_code: Optional[str] = None,
) -> GridContextResponse:
    """
    Computes complete, authoritative dynamic grid context for a target feeder
    by combining database models, geographic coordinates, and regional classification.
    """
    feeder = None
    if feeder_code:
        feeder = db_session.query(Feeder).filter(Feeder.code == feeder_code).first()
        if not feeder:
            feeder = db_session.query(Feeder).filter(Feeder.id == feeder_code).first()

    if not feeder:
        feeder = db_session.query(Feeder).first()

    if not feeder:
        # Minimal synthetic fallback when DB is completely empty
        detected = REGIONAL_UTILITY_PROFILES["generic"]
        return GridContextResponse(
            utility_name=detected["utility_name"],
            utility_short=detected["utility_short"],
            regulatory_body=detected["regulatory_body"],
            regulatory_band=detected["regulatory_band"],
            supply_code_standard=detected["supply_code_standard"],
            state=detected["state"],
            district="District Circle",
            town="Headquarters",
            feeder_code="FDR_DEFAULT",
            feeder_name="Default 11 kV Feeder",
            substation_code="SS_DEFAULT",
            substation_name="33/11 kV Substation",
            field_crew_default="Field Line Crew #1",
            climate_archetype=detected["climate_archetype"],
            diurnal_profile=DiurnalProfileContext(
                ambient_min_c=detected["ambient_min_c"],
                ambient_max_c=detected["ambient_max_c"],
                ambient_swing_c=detected["ambient_swing_c"],
                ambient_label=detected["ambient_label"],
                peak_hours_desc=detected["peak_hours_desc"],
                is_ag_shift_dominant=detected["is_ag_shift_dominant"],
                default_consumer_mix=detected["default_consumer_mix"],
                overload_driver_template=detected["overload_driver_template"],
            ),
            centroid_coordinates={"latitude": 11.2701, "longitude": 75.7657},
        )

    substation = db_session.query(Substation).filter(Substation.id == feeder.substation_id).first()
    organisation = None
    if substation:
        organisation = db_session.query(Organisation).filter(Organisation.id == substation.organisation_id).first()

    # Calculate centroid coordinates
    lat = None
    lon = None
    if substation and substation.geom:
        try:
            geom_str = str(substation.geom)
            if "POINT" in geom_str:
                parts = geom_str.replace("POINT (", "").replace("POINT(", "").replace(")", "").strip().split()
                if len(parts) >= 2:
                    lon = float(parts[0])
                    lat = float(parts[1])
        except Exception:
            pass

    if lat is None or lon is None:
        # Check DTR coordinates
        dtrs = (
            db_session.query(DistributionTransformer)
            .join(Bus, DistributionTransformer.bus_id == Bus.id)
            .filter(Bus.feeder_id == feeder.id)
            .all()
        )
        lat_sum = 0.0
        lon_sum = 0.0
        cnt = 0
        for d in dtrs:
            if d.geom and "POINT" in str(d.geom):
                try:
                    parts = str(d.geom).replace("POINT (", "").replace("POINT(", "").replace(")", "").strip().split()
                    if len(parts) >= 2:
                        lon_sum += float(parts[0])
                        lat_sum += float(parts[1])
                        cnt += 1
                except Exception:
                    pass
        if cnt > 0:
            lat = lat_sum / cnt
            lon = lon_sum / cnt

    # Combine text hints
    hint_parts = [
        feeder.name or "",
        feeder.code or "",
        substation.name or "" if substation else "",
        organisation.name or "" if organisation else "",
        organisation.code or "" if organisation else "",
        str(feeder.metadata_json or {}),
    ]
    hint_text = " ".join(hint_parts)

    detected = detect_grid_region(latitude=lat, longitude=lon, hint_text=hint_text)

    # Extract district and town from feeder metadata if available
    metadata = feeder.metadata_json or {}
    fallback_district = (
        "Kozhikode" if detected["utility_short"] == "KSEB"
        else ("Rangareddy" if detected["utility_short"] == "TSSPDCL"
        else f"{detected['state']} Central Circle")
    )
    fallback_town = (
        "KOZHIKODE" if detected["utility_short"] == "KSEB"
        else ("HYDERABAD" if detected["utility_short"] == "TSSPDCL"
        else "Metro Headquarters")
    )
    district = metadata.get("district") or fallback_district
    town = metadata.get("town") or fallback_town

    feeder_clean_name = feeder.name or f"Feeder {feeder.code}"
    crew_name = f"{feeder_clean_name} Field Crew #1"

    centroid_lat = lat if lat is not None else (11.270065 if detected["utility_short"] == "KSEB" else 17.3850)
    centroid_lon = lon if lon is not None else (75.765743 if detected["utility_short"] == "KSEB" else 78.4867)

    return GridContextResponse(
        utility_name=organisation.name if organisation and len(organisation.name) > 5 else detected["utility_name"],
        utility_short=organisation.code if organisation and organisation.code in REGIONAL_UTILITY_PROFILES else detected["utility_short"],
        regulatory_body=detected["regulatory_body"],
        regulatory_band=detected["regulatory_band"],
        supply_code_standard=detected["supply_code_standard"],
        state=detected["state"],
        district=district,
        town=town,
        feeder_code=feeder.code,
        feeder_name=feeder.name,
        substation_code=substation.code if substation else f"SS_{feeder.code}",
        substation_name=substation.name if substation else f"{feeder.name} 33/11 kV Substation",
        field_crew_default=crew_name,
        climate_archetype=detected["climate_archetype"],
        diurnal_profile=DiurnalProfileContext(
            ambient_min_c=detected["ambient_min_c"],
            ambient_max_c=detected["ambient_max_c"],
            ambient_swing_c=detected["ambient_swing_c"],
            ambient_label=detected["ambient_label"],
            peak_hours_desc=detected["peak_hours_desc"],
            is_ag_shift_dominant=detected["is_ag_shift_dominant"],
            default_consumer_mix=detected["default_consumer_mix"],
            overload_driver_template=detected["overload_driver_template"],
        ),
        centroid_coordinates={"latitude": round(centroid_lat, 6), "longitude": round(centroid_lon, 6)},
    )
