import type { SubjectStat } from '../dashboard';
import { QuizSubjectCard } from './QuizSubjectCard';
import { StudyItemCarousel } from './StudyItemCarousel';

export function ActiveSubjectCarousel({ subjects, onSelectSubject }: { subjects: SubjectStat[]; onSelectSubject: (subject: SubjectStat['subject']) => void }) {
  return <StudyItemCarousel
    items={subjects}
    id="continue-studying-subjects"
    title="Continue Studying"
    itemLabel="active subject"
    itemKey={stat => stat.subject.id}
    renderItem={stat => <QuizSubjectCard stat={stat} onSelect={onSelectSubject} />}
  />;
}
