// Office contact details transcribed from the footer supplied by the user.
const officeColumns = [
  [
    {
      "code": "sa",
      "name": "SAUDI ARABIA",
      "lines": [
        "AIPT for Patents Registration",
        "(SPC)",
        "Office 10, Bldg. 03, South of",
        "Manarat Al Riyadh School, Al",
        "Izdehar District, Exit (8),",
        "P.O Box 341774, Riyadh 11333,",
        "Mobile: +966 50 319 0075",
        "Riyadh, Saudi Arabia"
      ]
    },
    {
      "code": "eg",
      "name": "EGYPT",
      "lines": [
        "AIP&T Egypt LLC (Egyptian",
        "company)",
        "Office No. 384, 2nd Floor,",
        "Ibrahim Nawar St. Off Ahmed",
        "Fakhry St, 6th Zone, Nasr city,",
        "Cairo, Cairo, Egypt P.O Box 49 -",
        "Ramsis - code 11794 Cairo,",
        "Egypt Cairo,P 2024-Egypt"
      ]
    }
  ],
  [
    {
      "code": "ae",
      "name": "UAE",
      "lines": [
        "AIPT Intellectual Property",
        "Rights Management",
        "Office No. 1. 2nd Floor - Al",
        "Naboodah, Al Shoala Blg. Block",
        "#E, Port Saeed - Opposite Deira",
        "City Center, P.O. BOX 22065",
        "Mobile.: 00971501597140",
        "DUBAI,UAE"
      ]
    },
    {
      "code": "sd",
      "name": "SUDAN",
      "lines": [
        "Khartoum, Sudan",
        "Office No. 6, 3rd Floor, Estate",
        "No. 24 Square (50 Investment),",
        "Alsharqi Street, Arkwit,",
        "Khartoum, Republic of Sudan.",
        "P.O. Box: 7435 Khartoum,",
        "Republic of Sudan"
      ]
    }
  ],
  [
    {
      "code": "bh",
      "name": "BAHRAIN",
      "lines": [
        "AIP&T INTELLECTUAL",
        "PROPERTY LLC",
        "Office 12, Blg. No.363,Road",
        "1805, Al Hoora 318, Area",
        "P.O. Box: 20310,",
        "Mobilel: 00973 35628835",
        "Manama, Kingdom of",
        "Bahrain"
      ]
    },
    {
      "code": "tz",
      "name": "TANZANIA",
      "lines": [
        "Dar Es Salaam, Tanzania",
        "Plot No. 2200, Block 6,",
        "Room 103, City House,",
        "Mkwepu Street,",
        "Dar Es Salaam, Tanzania"
      ]
    },
    {
      "code": "ug",
      "name": "UGANDA",
      "lines": [
        "Kampala, Uganda",
        "Plot 16 Spring Road Bugolobi",
        "Kampala, Uganda"
      ]
    }
  ],
  [
    {
      "code": "kw",
      "name": "KUWAIT",
      "lines": [
        "AIPT for Trademarks",
        "Registration Agents (SPC)",
        "1st Floor, Building No.58",
        "Salah Aldin St., Office 3",
        "Jibla,Kuwait Plot No.",
        "616581487",
        "Mobile:+965 55143891"
      ]
    },
    {
      "code": "zanzibar",
      "name": "ZANZIBAR",
      "lines": [
        "Zanzibar",
        "553 Baghani",
        "Place P.O Box 1424,",
        "Zanzibar"
      ]
    },
    {
      "code": "ng",
      "name": "NIGERIA",
      "lines": [
        "Abuja, Nigeria",
        "No 37, TY Danjuma St.,",
        "Asokoro, Abuja Nigeria"
      ]
    }
  ],
  [
    {
      "code": "om",
      "name": "OMAN",
      "lines": [
        "Muscat, Oman",
        "2nd Floor, No. 207, Sala",
        "Building 3 Al Khuwair South",
        "17/1. Road No. 209 (behind",
        "the Radisson Blu Hotel)",
        "Muscat, Kingdom of Oman"
      ]
    },
    {
      "code": "cm",
      "name": "CAMEROON",
      "lines": [
        "Yaound\u00e9, Cameroon",
        "Rue 1.285 Essos Nord",
        "derri\u00e8re Chapelle face",
        "Garage MTA",
        "Yaound\u00e9 Cameroon"
      ]
    },
    {
      "code": "ly",
      "name": "LIBYA",
      "lines": [
        "Tripoli,Libya",
        "24 December St.,",
        "P.P. Box: 81145",
        "Tripoli, Libya"
      ]
    }
  ],
  [
    {
      "code": "lb",
      "name": "LEBANON",
      "lines": [
        "Beirut, Lebanon",
        "El Safa Street,",
        "Beirut, Lebanon"
      ]
    },
    {
      "code": "kz",
      "name": "KAZAKHSTAN",
      "lines": [
        "Astana, Kazakhstan",
        "8/8 Ryskulbekov Str.,",
        "Office 59, Almaty,",
        "Kazakhstan, 050042",
        "Astana, Kazakhstan"
      ]
    },
    {
      "code": "cl",
      "name": "CHILE",
      "lines": [
        "Santiago Chile",
        "Los Militares 5953, of 703",
        "Las Condes,",
        "Santiago, Chile"
      ]
    }
  ]
];

export default function QuotationOfficeFooter() {
  return <footer className="quotation-offices" aria-label="AIPT regional offices and contact details">
    {officeColumns.map((offices, index) => <div className="quotation-office-column" key={index}>
      {offices.map(office => <section className="quotation-office" key={office.name}>
        <h4><img src={`/images/office-flags/${office.code === 'zanzibar' ? 'zanzibar.svg' : office.code + '.png'}`} alt="" width={32} height={22} /><span>{office.name}</span></h4>
        <p>{office.lines.map((line, index) => <span key={index}>{line}</span>)}</p>
      </section>)}
    </div>)}
  </footer>;
}
