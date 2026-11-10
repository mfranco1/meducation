import type { SubjectStat } from '../selectors/progress';
import { StudyItemCarousel } from '../../../shared/ui/catalog/StudyItemCarousel';
import { ContinueStudyCard, completionProgress } from '../../../shared/ui/catalog/ContinueStudyCard';
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
      renderItem={(stat) => (
        <ContinueStudyCard
          title={stat.subject.name}
          activityLabel={[
            `${stat.activeQuizCount} ${stat.activeQuizCount === 1 ? 'quiz' : 'quizzes'} in progress`,
            stat.latest !== undefined && `Latest score ${stat.latest}%`,
          ]
            .filter(Boolean)
            .join(' · ')}
          progress={completionProgress(stat.completedQuizCount, stat.quizCount, 'quiz')}
          accessibleLabel={`Continue studying ${stat.subject.name}`}
          onContinue={() => onSelectSubject(stat.subject)}
          illustration={<StudyCardIllustration subjectId={stat.subject.id} />}
        />
      )}
    />
  );
}
