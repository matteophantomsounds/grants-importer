// import_grants_xml.js — downloads & parses Grants.gov ZIP file
import fs from 'fs';
import https from 'https';
import unzipper from 'unzipper';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function downloadZip(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`Request Failed: ${res.statusCode}`));
      resolve(res.pipe(unzipper.ParseOne()));
    }).on('error', reject);
  });
}

function extractAmount(raw) {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : `$${n.toLocaleString()}`;
}

async function run() {
  const today = new Date();
  const yyyymmdd = today.toISOString().split('T')[0].replace(/-/g, '');
  const zipUrl = `https://www.grants.gov/xml-extract/GrantsDBExtract${yyyymmdd}v2.zip`;

  console.log(`📦 Downloading: ${zipUrl}`);

  let xmlStream;
  try {
    xmlStream = await downloadZip(zipUrl);
  } catch (e) {
    console.error('❌ Failed to download or unzip file:', e.message);
    return;
  }

  const xml = await xmlStream.buffer();
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(xml.toString('utf8'));

  const grants = json.GrantOpportunities?.GrantOpportunity || [];
  console.log(`📄 Parsed ${grants.length} grants`);

  let inserted = 0;
  for (const grant of grants.slice(0, 100)) {
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
      console.error(`❌ Failed to insert: ${data.title}`, error.message);
    } else {
      inserted++;
    }
  }

  console.log(`✅ Inserted ${inserted} grants from Grants.gov ZIP extract`);
}

run();
