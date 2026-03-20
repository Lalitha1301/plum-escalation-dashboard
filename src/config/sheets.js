// Main data sheet — Email, Slack, WhatsApp, Escalations, Legend
export const MAIN_SHEET_ID = "1awiEiu-3RfY0oPeE-0QrzDS6n4pWKtikjaf_6bLXeiI";
// Employees sheet — separate Google Sheet file
export const EMP_SHEET_ID  = "1rPgRGgocg5_eZTRCSVAZegmQvEXTbDowNDYNLjojbcs";

export const TABS = {
  MASTER_ESCALATIONS: { sheetId: MAIN_SHEET_ID, gid: "237295288"  },
  EMAIL:              { sheetId: MAIN_SHEET_ID, gid: "364623113"  },
  SLACK:              { sheetId: MAIN_SHEET_ID, gid: "168921218"  },
  WHATSAPP:           { sheetId: MAIN_SHEET_ID, gid: "168921218"  },
  LEGEND:             { sheetId: MAIN_SHEET_ID, gid: "1069670103" },
  EMPLOYEES:          { sheetId: EMP_SHEET_ID,  gid: "491285366"  },
};

export const getSheetURL = ({ sheetId, gid }) => {
  const base = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  return `https://corsproxy.io/?${encodeURIComponent(base)}`;
};
