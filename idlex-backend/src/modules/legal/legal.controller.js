const fs = require('fs');
const path = require('path');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');

// The legal text lives in JSON generated from the same counsel-supplied
// documents the website renders, so the app and the site cannot drift into
// saying different things about deposits or refunds — which for operative
// legal text is not a cosmetic problem.
const CONTENT_DIR = path.join(__dirname, 'content');

const SLUGS = ['terms', 'privacy', 'security-deposit', 'cancellation-refund', 'community-guidelines'];

// Read once at boot. These change when counsel changes them, which is not at
// runtime, and re-reading four files on every request is pointless IO.
const docs = new Map();
for (const slug of SLUGS) {
  try {
    docs.set(slug, JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, `${slug}.json`), 'utf-8')));
  } catch (err) {
    console.error(`[legal] could not load ${slug}:`, err.message);
  }
}

const listDocs = asyncHandler(async (req, res) =>
  new ApiResponse(
    200,
    SLUGS.filter((s) => docs.has(s)).map((slug) => ({
      slug,
      title: docs.get(slug).title,
      description: docs.get(slug).description,
      effectiveDate: docs.get(slug).effectiveDate,
    })),
    'Legal documents'
  ).send(res)
);

// Which edition of the terms is currently in force. Signup stamps this on
// the account, so a later revision cannot make it look as though someone
// agreed to text that did not exist when they signed up.
const currentTermsVersion = () => docs.get('terms')?.effectiveDate ?? null;

const getDoc = asyncHandler(async (req, res) => {
  const doc = docs.get(req.params.slug);
  if (!doc) throw ApiError.notFound('No such document');
  return new ApiResponse(200, doc, doc.title).send(res);
});

// Support topics, served rather than hardcoded in each client for the same
// reason: an answer that is wrong in one place is worse than no answer.
const HELP = {
  title: 'Help & Support',
  contactEmail: 'idlexsupport@gmail.com',
  sections: [
    {
      heading: 'Renting an item',
      items: [
        {
          q: 'When am I charged?',
          a: 'Not when you request. The owner reviews your request first, and only once they approve it can you pay. An unanswered request expires and frees the dates again.',
        },
        {
          q: 'What is the deposit for?',
          a: 'It covers damage or a late return. It is held, not spent, and comes back to your original payment method once the owner confirms the item was returned.',
        },
        {
          q: 'The owner has not responded',
          a: 'Requests expire after 24 hours and nothing is charged. You can message the owner from the listing in the meantime.',
        },
      ],
    },
    {
      heading: 'Lending your items',
      items: [
        {
          q: 'What do I need before I can list?',
          a: 'Identity verification: a government document, a selfie taken at the time, and the bank details your rent will be paid into. It is reviewed by a person, usually within a day.',
        },
        {
          q: 'When do I get paid?',
          a: 'The rent becomes yours once the renter confirms they have received the item. The deposit stays held until you confirm it came back.',
        },
        {
          q: 'The item came back damaged',
          a: 'Report it before confirming the return. Our team reviews the evidence and decides what is deducted from the deposit — an owner cannot deduct unilaterally.',
        },
      ],
    },
    {
      heading: 'Payments',
      items: [
        {
          q: 'A payment failed but money left my account',
          a: 'It is returned automatically, usually within 5-7 working days. Check My Bookings first — if the booking is listed there, the payment did go through.',
        },
        {
          q: 'How do refunds reach me?',
          a: 'Back to the card or account you paid from. You do not need to supply bank details for a refund.',
        },
      ],
    },
  ],
};

const getHelp = asyncHandler(async (req, res) =>
  new ApiResponse(200, HELP, 'Help topics').send(res)
);

module.exports = { listDocs, getDoc, getHelp, currentTermsVersion };
