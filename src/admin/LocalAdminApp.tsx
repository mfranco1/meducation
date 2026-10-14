import { storedQuestionBank } from '../content/local/questionBank';
import { storedFlashcardBank } from '../content/local/flashcardBank';
import { InMemoryQuestionBankGateway } from './data/InMemoryQuestionBankGateway';
import { AdminWorkspace } from './AdminWorkspace';
const gateway = new InMemoryQuestionBankGateway(storedQuestionBank, storedFlashcardBank);
export default function LocalAdminApp() {
  return <AdminWorkspace gateway={gateway} />;
}
