// Never send password hashes (or other users' emails) to the browser.
const serializeUser = (doc, viewerId) => {
  if (!doc) return null;
  const u = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const isSelf = viewerId && String(u._id) === String(viewerId);
  delete u.password;
  delete u.__v;
  if (!isSelf) {
    delete u.email;
    delete u.certifications;
  }
  u.avatar = u.profilePicture || null; // older components read `avatar`
  return u;
};

const PUBLIC_FIELDS =
  'username profilePicture bio department experience_level graduation_year skills learning average_rating total_reviews timezone github_profile linkedin_profile';

module.exports = { serializeUser, PUBLIC_FIELDS };
