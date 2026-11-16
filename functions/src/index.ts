import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { executeGenkitStructuredHandoverFlow } from './genkit';

admin.initializeApp();

const geminiApiKeySecret = defineSecret('GEMINI_API_KEY');
const githubTokenSecret = defineSecret('GITHUB_TOKEN');
const githubPatSecret = defineSecret('GITHUB_PAT');

export const generateHandoverReport = onRequest(
  { secrets: [geminiApiKeySecret], cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
      }

      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing Firebase ID token' });
        return;
      }

      const idToken = authHeader.slice(7);
      const decoded = await admin.auth().verifyIdToken(idToken);
      const userSnap = await admin.firestore().collection('users').doc(decoded.uid).get();
      const userData = userSnap.data();

      if (!userData || !['ADMIN', 'TEAM_LEADER'].includes(userData.role)) {
        res.status(403).json({ error: 'Insufficient role permissions' });
        return;
      }

      const { handoverId, projectName } = req.body;
      const sourcesSnap = await admin
        .firestore()
        .collection('sources')
        .where('handoverId', '==', handoverId)
        .get();

      const sources = sourcesSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      const items = await executeGenkitStructuredHandoverFlow({
        projectName: projectName || 'Handover Project',
        sources,
        geminiApiKey: geminiApiKeySecret.value(),
      });

      res.status(200).json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal Cloud Function error' });
    }
  }
);

export { githubTokenSecret, githubPatSecret };

