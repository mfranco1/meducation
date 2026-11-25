import type { SubjectStat } from '../selectors/progress';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { ContinueStudyCard, completedPercent } from '../../../shared/ui/catalog/ContinueStudyCard';
import { StudyCardIllustration } from '../../../shared/ui/catalog/StudyCardIllustration';

/** Progress in the subject's most recently active quiz, such as "12 of 40 questions answered". */
function answeredProgress({ answered, total }: NonNullable<SubjectStat['latestActive']>) {
  const unit = (total ?? answered) === 1 ? 'question' : 'questions';
  return total === undefined
    ? { label: `${answered} ${unit} answered` }
    : { percent: completedPercent(answered, total), label: `${answered} of ${total} ${unit} answered` };
}

export function ActiveSubjectCarousel({
  subjects,
  onSelectSubject,
}: {
  subjects: SubjectStat[];
  onSelectSubject: (subject: SubjectStat['subject']) => void;
}) {
  return (
    <StudyItemCarousel
      items={subjects}
      id="continue-studying-subjects"
      title="Continue Studying"
      itemLabel="active subject"
      itemKey={(stat) => stat.subject.id}
      renderItem={(stat) => (
        <ContinueStudyCard
          title={stat.subject.name}
          activityLabel={`${stat.activeQuizCount} ${stat.activeQuizCount === 1 ? 'quiz' : 'quizzes'} in progress`}
          progress={stat.latestActive && answeredProgress(stat.latestActive)}
          accessibleLabel={`Continue studying ${stat.subject.name}`}
          onContinue={() => onSelectSubject(stat.subject)}
          illustration={<StudyCardIllustration subjectId={stat.subject.id} />}
        />
      )}
    />
  );
}
