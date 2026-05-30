import React from "react";
import { Box, Text } from "ink";
import type { SkillSummary } from "../skills/discovery.js";

export function SkillList(props: { skills: SkillSummary[] }): React.ReactElement {
  return (
    <Box flexDirection="column">
      {props.skills.length === 0 ? (
        <Text color="gray">No skills</Text>
      ) : (
        props.skills.map((skill) => (
          <Text key={`${skill.scope}:${skill.name}`}>{`${skill.scope}/${skill.name} ${skill.description}`}</Text>
        ))
      )}
    </Box>
  );
}
