// Skills/learning goals arrive as objects ({ name, proficiency… }) but older code treated them as strings.
export const skillName = (item) => (typeof item === 'string' ? item : item?.name || '');
export const skillNames = (list) => (Array.isArray(list) ? list.map(skillName).filter(Boolean) : []);
