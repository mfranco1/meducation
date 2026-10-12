import type { SubjectStat } from '../selectors/dashboard';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { ContinueStudyCard } from '../../../shared/ui/catalog/ContinueStudyCard';
import { StudyCardIllustration } from '../../../shared/ui/catalog/StudyCardIllustration';

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
      layout="continueStudy"
      headingVisibility="srOnly"
      renderItem={(stat) => (
        <ContinueStudyCard
          title={stat.subject.name}
          activityLabel={`${stat.activeQuizCount} ${stat.activeQuizCount === 1 ? 'quiz' : 'quizzes'} in progress`}
          accessibleLabel={`Continue studying ${stat.subject.name}`}
          onContinue={() => onSelectSubject(stat.subject)}
          illustration={<StudyCardIllustration subjectId={stat.subject.id} />}
        />
      )}
    />
  );
}
