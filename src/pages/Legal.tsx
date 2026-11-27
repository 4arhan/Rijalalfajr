import { Screen, useSession } from '../ui';
import { t } from '../lib/i18n';

export function RulesPage() {
  const { me } = useSession();
  return (
    <Screen title={t('Rules and fair play')} back={me ? true : '/'}>
      <section className="card form">
        <h3>{t('How check-in works')}</h3>
        <p className="small">{t('You check in once per Fajr, at a registered mosque, between shortly before the adhan and sunrise. You scan the code on the mosque\'s screen, or the printed poster while your phone is at the mosque, or a volunteer marks you on the attendance list.')}</p>
        <h3>{t('How ranking works')}</h3>
        <p className="small">{t('People are ranked by the number of days they attended Fajr. Ties are broken by the longest streak, then by who arrives earliest on average. A mosque\'s place on the world leaderboard comes from the Fajr prayers prayed inside it.')}</p>
        <h3>{t('Fair play')}</h3>
        <p className="small">{t('Check in only when you are at the mosque for Fajr, and only for yourself and your own family. Mosque admins can remove a check-in that was made by mistake or dishonestly, and the app owner can suspend a mosque that abuses the leaderboard.')}</p>
        <h3>{t('Excused days')}</h3>
        <p className="small">{t('A mosque admin or volunteer can excuse a member for a day, for illness or travel. An excused day does not break a streak, and it does not count as a day attended.')}</p>
        <p className="small">{t('You can also ask from Me for days to be excused, with a reason. Your mosque decides.')}</p>
        <h3>{t('The roll of honour')}</h3>
        <p className="small">{t('Forty dawns in a row at the mosque puts your name on your mosque’s roll of honour, and it stays there. If you hide your name, it shows as “Anonymous striver”.')}</p>
        <h3>{t('Prizes')}</h3>
        <p className="small">{t('Any prize is offered, funded and handed out by the mosque or organisation that announced it. Rijal al-Fajr only shows the prize and the standings. There is nothing to buy and no entry fee. Apple and Google are not sponsors and are not involved in any way.')}</p>
        <h3>{t('Intention')}</h3>
        <p className="small">{t('The leaderboard is encouragement, not the goal. If seeing your name on it does not help your intention, you can hide your name in Me.')}</p>
      </section>
    </Screen>
  );
}

export function PrivacyPage() {
  const { me } = useSession();
  return (
    <Screen title={t('Privacy')} back={me ? true : '/'}>
      <section className="card form">
        <h3>{t('What we store')}</h3>
        <p className="small">{t('Your email, a scrambled form of your password, your display name and group, your home mosque, and the date, time and mosque of each check-in. For children we store only a display name and group. They have no account, no email and no password.')}</p>
        <h3>{t('Location')}</h3>
        <p className="small">{t('When you check in from a printed poster we ask for your location once, to confirm you are at the mosque. We keep the distance in metres with the check-in. We do not keep where you were and we never track you.')}</p>
        <h3>{t('Who sees what')}</h3>
        <p className="small">{t('Signed-in people see your display name, days attended and streak on your mosque\'s leaderboard. Anyone with the link to a mosque\'s page can see its podium without an account, with names cut to a first name and an initial; a mosque can turn that off. You can hide your name everywhere. Your buddies see whether you checked in today and your streak. Mosque staff see who checked in at their mosque. The world leaderboard shows only totals.')}</p>
        <p className="small">{t('Milestones you reach, such as a week in a row, show on your mosque’s page unless you hide your name. If you tap “I’m awake”, your buddies and squad see it for a few hours. A reason you give when asking to be excused is seen only by your mosque’s staff, who can also see which regulars have stopped coming. Your patterns are shown only to you.')}</p>
        <p className="small">{t('If you offer an item from a mosque’s wish-list, that mosque’s admins see your contact details, and the name you gave is shown publicly once they confirm the gift.')}</p>
        <h3>{t('What we do not do')}</h3>
        <p className="small">{t('No ads. No selling or sharing of your data. No tracking across other apps or sites.')}</p>
        <h3>{t('Deleting your data')}</h3>
        <p className="small">{t('Delete your account in Me. That removes your account, your family members and every check-in of yours, straight away and for good.')}</p>
      </section>
    </Screen>
  );
}
