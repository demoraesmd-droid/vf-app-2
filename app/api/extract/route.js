import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert at reading Humphrey Visual Field (HVF) printouts. Extract ALL data with perfect accuracy.

CRITICAL INSTRUCTIONS:
1. Return ONLY raw JSON — no markdown, no backticks, no explanation text whatsoever.
2. For 10-2 tests: there are exactly 68 test points. You MUST extract all 68. Do NOT stop early.
3. For 24-2 tests: there are 54 test points. Extract all of them.
4. Scan the ENTIRE numeric grid including outermost rows and columns.

GRID READING METHOD for 10-2 (68 points):
- Row 1 (top): 2 points (cols 5-6)
- Row 2: 6 points (cols 3-8)
- Row 3: 8 points (cols 2-9)
- Row 4: 8 points (cols 2-9)
- Row 5: 10 points (cols 1-10)
- Row 6: 10 points (cols 1-10)
- Row 7: 8 points (cols 2-9)
- Row 8: 8 points (cols 2-9)
- Row 9: 6 points (cols 3-8) — DO NOT SKIP
- Row 10 (bottom): 2 points (cols 5-6) — DO NOT SKIP
Total = 2+6+8+8+10+10+8+8+6+2 = 68 points

Return this exact JSON structure:
{
  "patient_info": {
    "name": "", "id": "", "date_of_birth": "", "test_date": "",
    "eye": "OD or OS", "test_type": "24-2 or 10-2",
    "fixation_losses": "", "false_pos_errors": "", "false_neg_errors": "",
    "test_duration": "", "foveal_threshold": "", "stimulus": "",
    "background": "", "strategy": "", "pupil_diameter": "",
    "visual_acuity": "", "rx_used": ""
  },
  "global_indices": {
    "MD": "", "MD_p": "", "PSD": "", "PSD_p": "", "VFI": "", "GHT": ""
  },
  "threshold_values": [{"x": 1, "y": 1, "value": 0}],
  "total_deviation": [{"x": 1, "y": 1, "value": 0}],
  "pattern_deviation": [{"x": 1, "y": 1, "value": 0}]
}
x = column (1=leftmost), y = row (1=topmost). Only include positions with actual values.`

export async function POST(request) {
  try {
    const { imageBase64, mediaType } = await request.json()
    if (!imageBase64) return Response.json({ error: 'No image provided' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return Response.json({ error: 'Server misconfigured — contact admin' }, { status: 500 })

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'Extract all visual field data from this image and return as JSON.' }
        ]
      }]
    })

    const rawText = message.content?.find(b => b.type === 'text')?.text || '{}'
    const clean = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim()

    try {
      return Response.json({ data: JSON.parse(clean) })
    } catch {
      return Response.json({ error: `Response truncated — try a smaller image. (${clean.length} chars)` }, { status: 422 })
    }
  } catch (err) {
    console.error(err)
    return Response.json({ error: err.message || 'Unknown error' }, { status: 500 })
  }
}
