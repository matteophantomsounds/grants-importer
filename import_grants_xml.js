// import_grants_xml.js
import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const xml = fs.readFileSync('./GrantsDBExtract20250506v2.xml', 'utf8');
const parser = new XMLParser({ ignoreAttributes: false });
const json = parser.parse(xml);
const grants = json.GrantOpportunities?.GrantOpportunity || [];

console.log(`📦 Found ${grants.length} grants`);

function extractAmount(raw) {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : `$${n.toLocaleString()}`;
}

async function insertGrants() {
  let count = 0;

  for (const grant of grants.slice(0, 100)) { // adjust limit as needed
    const data = {
      title: grant.OpportunityTitle || '',
      body: grant.Synopsis || '',
      source_url: grant.URL || '',
      organization: grant.AgencyName || 'Grants.gov',
      deadline: grant.CloseDate || null,
      eligibility_text: grant.Eligibility?.EligibilityCategory || null,
      amount: extractAmount(grant.EstimatedTotalProgramFunding),
      category: ['Government'],
      processed_at: new Date().toISOString()
    };

    const { error } = await supabase.from('grants').insert(data);
    if (error) {
      console.error(`❌ Failed: ${grant.OpportunityTitle}`, error.message);
    } else {
      count++;
    }
  }

  console.log(`✅ Inserted ${count} grants`);
}

insertGrants();
