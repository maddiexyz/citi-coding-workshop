/**
 * Group people by department (people without one last), with each group's
 * headcount, capacity and allocated hours this week, and over-allocated count.
 */
export default function groupByDepartment(people) {
  const groups = new Map();
  people.forEach((person) => {
    const name = person.department_name ?? 'No department';
    if (!groups.has(name)) groups.set(name, { name, people: [], capacity: 0, allocated: 0, over: 0 });
    const group = groups.get(name);
    group.people.push(person);
    group.capacity += Number(person.weekly_hours);
    group.allocated += Number(person.week_hours ?? 0);
    if (person.over_allocated) group.over += 1;
  });
  return [...groups.values()].sort((a, b) => {
    if (a.name === 'No department') return 1;
    if (b.name === 'No department') return -1;
    return a.name.localeCompare(b.name);
  });
}
